import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { evaluateMatch, RULES_VERSION, type MatchResult, type MatchableProperty, type MatchableRequirement } from './engine'
import type { ZoneRef } from '../buyerRequirements/service'

/**
 * Las dos direcciones del matching (FASE 11), sobre el mismo motor.
 *
 *   Necesidad → inmuebles compatibles
 *   Inmueble  → compradores compatibles
 *
 * Ninguna de las dos compara todo contra todo en memoria: primero se recorta
 * en SQL por los criterios duros e indexables (tenant, operación, estado,
 * precio con margen), y sólo se puntúa en detalle lo que sobrevive. El margen
 * existe porque el motor admite cumplimiento parcial: si el prefiltro cortara
 * exactamente en el precio máximo, un piso 2 % por encima nunca llegaría a
 * evaluarse y no se podría enseñar como "casi".
 *
 * El motor y el prefiltro son agnósticos al catálogo: `developer_properties`
 * (obra nueva) y `agent_properties` (2ª mano) comparten exactamente las
 * columnas que el motor necesita desde Property Core (migración 0068), así
 * que las dos direcciones funcionan igual sobre cualquiera de los dos — nunca
 * dos motores paralelos (FASE 11 §58).
 */

export type PropertyKind = 'developer' | 'agent'
export const PROPERTY_KINDS: PropertyKind[] = ['developer', 'agent']

/** Margen del prefiltro, alineado con PARTIAL_TOLERANCE del motor. */
const PREFILTER_SLACK = 0.1

/** Tope de candidatos que se puntúan en detalle en una petición (por catálogo). */
const MAX_CANDIDATES = 400

export const MATCH_STATUSES = ['new', 'selected', 'sent', 'discarded', 'viewing', 'offered'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

/**
 * Estados que hoy se pueden fijar de verdad desde el panel.
 *
 * `sent` queda fuera a propósito: marcarlo sin que exista un envío real
 * convertiría el historial en una mentira — lo pondrá el Centro de
 * Comunicaciones cuando registre el envío. `viewing` y `offered` esperan a
 * Appointment y Offer; no se inventa aquí una tabla provisional para
 * simularlos.
 */
export const MANUAL_STATUSES: MatchStatus[] = ['new', 'selected', 'discarded']

/**
 * Todo lo que distingue un catálogo del otro para el motor: qué tabla de
 * propiedades consultar y en qué tabla persistir sus matches. `as any` en los
 * accesos a columnas dentro de este archivo es deliberado — developer_properties
 * y agent_properties son tablas Drizzle distintas que comparten forma pero no
 * tipo, y una function genérica sobre "la que toque" no puede tipar cada
 * columna sin duplicar las dos direcciones enteras por catálogo. El motor
 * (evaluateMatch) sigue totalmente tipado; sólo la capa de acceso a datos
 * relaja el tipo.
 */
function tablesFor(kind: PropertyKind) {
  return kind === 'developer'
    ? { property: schema.developerProperties as any, match: schema.developerPropertyMatches as any }
    : { property: schema.agentProperties as any, match: schema.propertyMatches as any }
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toMatchable(row: typeof schema.buyerRequirements.$inferSelect, criteria: { criterionType: string; importance: string; valueBool: number | null }[]): MatchableRequirement {
  return {
    id: row.id,
    operation: row.operation,
    propertyTypes: safeParse<string[]>(row.propertyTypesJson, []),
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    areaMin: row.areaMin,
    areaMax: row.areaMax,
    bedroomsMin: row.bedroomsMin,
    bathroomsMin: row.bathroomsMin,
    desiredZones: safeParse<ZoneRef[]>(row.desiredZonesJson, []),
    excludedZones: safeParse<ZoneRef[]>(row.excludedZonesJson, []),
    centerLat: row.centerLat,
    centerLng: row.centerLng,
    radiusKm: row.radiusKm,
    conditionPref: row.conditionPref,
    buildPref: row.buildPref,
    criteria,
  }
}

async function criteriaFor(event: H3Event, orgId: number, requirementIds: number[]) {
  const db = useDb(event)
  if (!requirementIds.length) return new Map<number, { criterionType: string; importance: string; valueBool: number | null }[]>()
  const rows = await db
    .select()
    .from(schema.buyerRequirementCriteria)
    .where(and(eq(schema.buyerRequirementCriteria.organizationId, orgId), inArray(schema.buyerRequirementCriteria.buyerRequirementId, requirementIds)))

  const byRequirement = new Map<number, { criterionType: string; importance: string; valueBool: number | null }[]>()
  for (const r of rows) {
    const list = byRequirement.get(r.buyerRequirementId) || []
    list.push({ criterionType: r.criterionType, importance: r.importance, valueBool: r.valueBool })
    byRequirement.set(r.buyerRequirementId, list)
  }
  return byRequirement
}

export interface ScoredProperty {
  propertyKind: PropertyKind
  property: MatchableProperty & { slug: string | null; mainImage: string | null; location: string | null; name: string | null }
  result: MatchResult
  /** El match guardado, si alguien ya decidió algo sobre este par. */
  persisted: { id: number; status: string; discardedReason: string | null } | null
}

/** Candidatos con margen de precio de un catálogo, ya recortados en SQL. */
async function candidatesInCatalog(event: H3Event, orgId: number, kind: PropertyKind, matchable: MatchableRequirement) {
  const db = useDb(event)
  const { property: P } = tablesFor(kind)

  const filters = [eq(P.organizationId, orgId)]
  // agent_properties usa status='available'; developer_properties no tiene ese
  // concepto de disponibilidad binaria (new/under_construction/ready son todas
  // comercializables) — sólo se filtra por estado en el catálogo que lo define.
  if (kind === 'agent') filters.push(eq(P.status, 'available'))

  filters.push(or(isNull(P.transactionType), eq(P.transactionType, matchable.operation))!)
  if (matchable.propertyTypes?.length) {
    filters.push(or(isNull(P.propertyType), inArray(P.propertyType, matchable.propertyTypes))!)
  }
  if (matchable.priceMax != null) {
    filters.push(or(isNull(P.price), lte(P.price, matchable.priceMax * (1 + PREFILTER_SLACK)))!)
  }
  if (matchable.priceMin != null) {
    filters.push(or(isNull(P.price), gte(P.price, matchable.priceMin * (1 - PREFILTER_SLACK)))!)
  }

  const candidates = await db.select().from(P).where(and(...filters)).limit(MAX_CANDIDATES)
  return candidates as (MatchableProperty & { slug: string | null; mainImage: string | null; location: string | null; name: string | null })[]
}

async function persistedMatchesForRequirement(event: H3Event, orgId: number, kind: PropertyKind, requirementId: number) {
  const db = useDb(event)
  const { match: M } = tablesFor(kind)
  const rows = await db.select().from(M).where(and(eq(M.organizationId, orgId), eq(M.buyerRequirementId, requirementId)))
  return new Map<number, any>(rows.map((m: any) => [m.propertyId, m]))
}

/**
 * Necesidad → inmuebles compatibles, en los DOS catálogos a la vez (FASE 11
 * §133: "verificar ambos contextos — Propiedades web y 2ª mano"). El resultado
 * de cada propiedad lleva su `propertyKind` para que quien lo consuma sepa a
 * qué ficha enlazar.
 */
export async function findPropertiesForRequirement(
  event: H3Event,
  orgId: number,
  requirementId: number,
  opts: { includeIneligible?: boolean; limit?: number } = {},
): Promise<{ requirement: MatchableRequirement; results: ScoredProperty[]; scanned: number } | null> {
  const db = useDb(event)

  const requirement = (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
      .limit(1)
  )[0]
  if (!requirement) return null

  const criteriaMap = await criteriaFor(event, orgId, [requirementId])
  const matchable = toMatchable(requirement, criteriaMap.get(requirementId) || [])

  const results: ScoredProperty[] = []
  let scanned = 0

  for (const kind of PROPERTY_KINDS) {
    const candidates = await candidatesInCatalog(event, orgId, kind, matchable)
    scanned += candidates.length
    const byProperty = await persistedMatchesForRequirement(event, orgId, kind, requirementId)

    for (const property of candidates) {
      const result = evaluateMatch(property, matchable)
      if (result.eligibility === 'ineligible' && !opts.includeIneligible) continue
      const saved = byProperty.get(property.id)
      results.push({
        propertyKind: kind,
        property,
        result,
        persisted: saved ? { id: saved.id, status: saved.status, discardedReason: saved.discardedReason } : null,
      })
    }
  }

  sortByScore(results)
  return { requirement: matchable, results: results.slice(0, opts.limit ?? 50), scanned }
}

export interface ScoredRequirement {
  requirement: MatchableRequirement & { title: string; contactId: number; assignedCommercialId: number | null; status: string }
  contact: { id: number; name: string; email: string | null; phone: string | null } | null
  result: MatchResult
  persisted: { id: number; status: string; discardedReason: string | null } | null
}

/**
 * Inmueble → compradores compatibles. Misma lógica de puntuación, prefiltro
 * simétrico: sólo necesidades activas de la organización cuya operación
 * coincide y cuyo rango de precio puede alcanzar al del inmueble. `kind` dice
 * en qué catálogo vive el inmueble — una Property es de uno u otro, nunca de
 * los dos a la vez, así que aquí no hace falta recorrer ambos.
 */
export async function findRequirementsForProperty(
  event: H3Event,
  orgId: number,
  propertyId: number,
  kind: PropertyKind,
  opts: { includeIneligible?: boolean; limit?: number } = {},
): Promise<{ property: MatchableProperty; results: ScoredRequirement[]; scanned: number } | null> {
  const db = useDb(event)
  const { property: P, match: M } = tablesFor(kind)

  const property = (await db.select().from(P).where(and(eq(P.id, propertyId), eq(P.organizationId, orgId))).limit(1))[0]
  if (!property) return null

  const filters = [
    eq(schema.buyerRequirements.organizationId, orgId),
    eq(schema.buyerRequirements.status, 'active'),
    isNull(schema.buyerRequirements.deletedAt),
  ]
  if (property.transactionType) filters.push(eq(schema.buyerRequirements.operation, property.transactionType))
  if (property.price != null) {
    // El precio del inmueble tiene que caber en la horquilla de la necesidad,
    // con el mismo margen que usa el motor para el cumplimiento parcial.
    filters.push(or(isNull(schema.buyerRequirements.priceMax), gte(schema.buyerRequirements.priceMax, property.price / (1 + PREFILTER_SLACK)))!)
    filters.push(or(isNull(schema.buyerRequirements.priceMin), lte(schema.buyerRequirements.priceMin, property.price * (1 + PREFILTER_SLACK)))!)
  }

  const candidates = await db
    .select()
    .from(schema.buyerRequirements)
    .where(and(...filters))
    .limit(MAX_CANDIDATES)

  const criteriaMap = await criteriaFor(event, orgId, candidates.map((c) => c.id))

  const contactIds = [...new Set(candidates.map((c) => c.contactId))]
  const contacts = contactIds.length
    ? await db
        .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
        .from(schema.contacts)
        .where(and(eq(schema.contacts.organizationId, orgId), inArray(schema.contacts.id, contactIds)))
    : []
  const byContact = new Map(contacts.map((c) => [c.id, c]))

  const persisted = await db.select().from(M).where(and(eq(M.organizationId, orgId), eq(M.propertyId, propertyId)))
  const byRequirement = new Map<number, any>(persisted.map((m: any) => [m.buyerRequirementId, m]))

  const results: ScoredRequirement[] = []
  for (const row of candidates) {
    const matchable = toMatchable(row, criteriaMap.get(row.id) || [])
    const result = evaluateMatch(property as MatchableProperty, matchable)
    if (result.eligibility === 'ineligible' && !opts.includeIneligible) continue
    const saved = byRequirement.get(row.id)
    results.push({
      requirement: { ...matchable, title: row.title, contactId: row.contactId, assignedCommercialId: row.assignedCommercialId, status: row.status },
      contact: byContact.get(row.contactId) || null,
      result,
      persisted: saved ? { id: saved.id, status: saved.status, discardedReason: saved.discardedReason } : null,
    })
  }

  sortByScore(results)
  return { property: property as MatchableProperty, results: results.slice(0, opts.limit ?? 50), scanned: candidates.length }
}

/**
 * Orden estable y determinista: primero los elegibles, después por score, y a
 * igualdad de score por id. Sin el desempate por id, dos peticiones idénticas
 * podrían devolver el mismo listado en distinto orden según cómo leyera la
 * base de datos.
 */
function sortByScore(list: { result: MatchResult; property?: { id: number }; requirement?: { id: number } }[]) {
  const rank = (e: string) => (e === 'eligible' ? 0 : e === 'needs_review' ? 1 : 2)
  list.sort((a, b) => {
    const byEligibility = rank(a.result.eligibility) - rank(b.result.eligibility)
    if (byEligibility) return byEligibility
    const byScore = (b.result.score ?? -1) - (a.result.score ?? -1)
    if (byScore) return byScore
    return (a.property?.id ?? a.requirement?.id ?? 0) - (b.property?.id ?? b.requirement?.id ?? 0)
  })
}

export class MatchStatusError extends Error {}

/**
 * Guarda la decisión comercial sobre un par (necesidad, inmueble).
 *
 * El score y el desglose se recalculan aquí con el motor y NO se aceptan del
 * cliente: si el navegador pudiera mandar el score, el histórico diría lo que
 * quisiera quien llamó a la API.
 */
export async function setMatchStatus(
  event: H3Event,
  orgId: number,
  input: { buyerRequirementId: number; propertyId: number; propertyKind: PropertyKind; status: MatchStatus; discardedReason?: string | null },
  opts: { userId?: number | null } = {},
) {
  const db = useDb(event)
  const { property: P, match: M } = tablesFor(input.propertyKind)

  if (!MANUAL_STATUSES.includes(input.status)) {
    // No se marca como enviado/visitado/ofertado algo que el sistema no ha
    // registrado de verdad. Esos estados llegarán cuando exista el envío real
    // (Comunicaciones), la visita (Appointment) y la oferta (Offer).
    throw new MatchStatusError(
      `El estado "${input.status}" no se puede fijar a mano: lo marcará el módulo que registre la acción real (envío, visita u oferta).`,
    )
  }

  const requirement = (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, input.buyerRequirementId), eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
      .limit(1)
  )[0]
  if (!requirement) throw new MatchStatusError('Necesidad no encontrada')

  const property = (await db.select().from(P).where(and(eq(P.id, input.propertyId), eq(P.organizationId, orgId))).limit(1))[0]
  if (!property) throw new MatchStatusError('Inmueble no encontrado')

  const criteriaMap = await criteriaFor(event, orgId, [requirement.id])
  const result = evaluateMatch(property as MatchableProperty, toMatchable(requirement, criteriaMap.get(requirement.id) || []))

  const nowTs = now()
  const values = {
    organizationId: orgId,
    propertyId: input.propertyId,
    buyerRequirementId: input.buyerRequirementId,
    contactId: requirement.contactId,
    score: result.score,
    eligibility: result.eligibility,
    confidence: result.confidence,
    status: input.status,
    // El motivo sólo tiene sentido en un descarte; arrastrarlo a otros estados
    // dejaría "descartado porque X" en un match que vuelve a estar vivo.
    discardedReason: input.status === 'discarded' ? input.discardedReason || null : null,
    breakdownJson: JSON.stringify({ criteria: result.criteria, explanation: result.explanation }),
    rulesVersion: RULES_VERSION,
    createdBy: opts.userId ?? null,
    createdAt: nowTs,
    updatedAt: nowTs,
  }

  await db
    .insert(M)
    .values(values)
    .onConflictDoUpdate({
      target: [M.buyerRequirementId, M.propertyId],
      set: {
        score: values.score,
        eligibility: values.eligibility,
        confidence: values.confidence,
        status: values.status,
        discardedReason: values.discardedReason,
        breakdownJson: values.breakdownJson,
        rulesVersion: values.rulesVersion,
        updatedAt: nowTs,
      },
    })

  return (
    await db
      .select()
      .from(M)
      .where(and(eq(M.organizationId, orgId), eq(M.buyerRequirementId, input.buyerRequirementId), eq(M.propertyId, input.propertyId)))
      .limit(1)
  )[0]
}

/** Deja constancia de que alguien repasó las características del inmueble, que es lo que convierte un 0 en un "no". */
export async function markFeaturesReviewed(event: H3Event, orgId: number, propertyId: number, kind: PropertyKind, userId: number | null) {
  const db = useDb(event)
  const { property: P } = tablesFor(kind)
  await db
    .update(P)
    .set({ featuresReviewedAt: now(), featuresReviewedBy: userId, updatedAt: now() })
    .where(and(eq(P.id, propertyId), eq(P.organizationId, orgId)))
  return (
    await db
      .select({ id: P.id, featuresReviewedAt: P.featuresReviewedAt })
      .from(P)
      .where(and(eq(P.id, propertyId), eq(P.organizationId, orgId)))
      .limit(1)
  )[0]
}

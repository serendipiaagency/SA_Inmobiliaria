import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { evaluateMatch, importanceOf, RULES_VERSION, type MatchResult, type MatchableProperty, type MatchableRequirement } from './engine'
import type { ZoneRef } from '../buyerRequirements/service'
import { recordActivity } from '../activity/service'
import { livePropertyCond } from '../properties/trash'
import { selectInChunks } from '../sqlChunks'

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
 *
 * Exportada porque `properties/searchService.ts` (FASE 27) la reutiliza para
 * el mismo mapeo kind→tabla en el filtro profesional del listado admin y en
 * la búsqueda cross-catálogo — una sola forma de resolver "kind -> tabla" en
 * todo el repo, no tres.
 */
export function tablesFor(kind: PropertyKind) {
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
  // Por trozos: Inmueble → compradores puede llegar con cientos de necesidades
  // candidatas y D1 no admite más de 100 parámetros por consulta.
  const rows = await selectInChunks([...new Set(requirementIds)], (part) =>
    db
      .select()
      .from(schema.buyerRequirementCriteria)
      .where(and(eq(schema.buyerRequirementCriteria.organizationId, orgId), inArray(schema.buyerRequirementCriteria.buyerRequirementId, part))),
  )

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

/**
 * Los datos de la ficha ampliada (`property_details`) que el motor lee:
 * reformado / año de reforma (obra «reformado») y aire acondicionado. Se
 * añaden a la fila del catálogo sin pisar nada; una propiedad sin ficha
 * ampliada se queda con esos datos a NULL, que el motor lee como «no consta».
 */
export async function withPropertyDetails<T extends Record<string, any>>(db: any, orgId: number, kind: PropertyKind, rows: T[]): Promise<(T & MatchableDetails)[]> {
  if (!rows.length) return rows as (T & MatchableDetails)[]
  const D = schema.propertyDetails
  // Por trozos: hasta MAX_CANDIDATES ids, y D1 no admite más de 100 parámetros por consulta.
  const details = await selectInChunks<number, any>([...new Set(rows.map((r) => Number(r.id)))], (part) =>
    db
      .select({ propertyId: D.propertyId, isRenovated: D.isRenovated, renovationYear: D.renovationYear, hasAirConditioning: D.hasAirConditioning })
      .from(D)
      .where(and(eq(D.organizationId, orgId), eq(D.propertyKind, kind), inArray(D.propertyId, part))),
  )
  const byProperty = new Map<number, MatchableDetails>(details.map((d: any) => [d.propertyId, { isRenovated: d.isRenovated, renovationYear: d.renovationYear, hasAirConditioning: d.hasAirConditioning }]))
  return rows.map((r) => ({ ...r, ...(byProperty.get(Number(r.id)) || { isRenovated: null, renovationYear: null, hasAirConditioning: null }) }))
}

type MatchableDetails = Pick<MatchableProperty, 'isRenovated' | 'renovationYear' | 'hasAirConditioning'>

/** Candidatos con margen de precio de un catálogo, ya recortados en SQL. */
async function candidatesInCatalog(event: H3Event, orgId: number, kind: PropertyKind, matchable: MatchableRequirement) {
  const db = useDb(event)
  const { property: P } = tablesFor(kind)

  // Una propiedad en la papelera no es candidata para nadie.
  const filters = [eq(P.organizationId, orgId), livePropertyCond(P)]
  // agent_properties usa status='available'; developer_properties no tiene ese
  // concepto de disponibilidad binaria (new/under_construction/ready son todas
  // comercializables) — sólo se filtra por estado en el catálogo que lo define.
  if (kind === 'agent') filters.push(eq(P.status, 'available'))

  filters.push(or(isNull(P.transactionType), eq(P.transactionType, matchable.operation))!)
  // El tipo sólo recorta en SQL cuando es imprescindible (lo es por defecto).
  // Si la necesidad lo bajó a preferible o indiferente, los demás tipos tienen
  // que llegar al motor para puntuar (o no) — si no, esa importancia sería
  // mentira en esta dirección y verdad en la contraria.
  if (matchable.propertyTypes?.length && importanceOf(matchable, 'propertyType') === 'required') {
    filters.push(or(isNull(P.propertyType), inArray(P.propertyType, matchable.propertyTypes))!)
  }
  if (matchable.priceMax != null) {
    filters.push(or(isNull(P.price), lte(P.price, matchable.priceMax * (1 + PREFILTER_SLACK)))!)
  }
  if (matchable.priceMin != null) {
    filters.push(or(isNull(P.price), gte(P.price, matchable.priceMin * (1 - PREFILTER_SLACK)))!)
  }

  const candidates = await db.select().from(P).where(and(...filters)).limit(MAX_CANDIDATES)
  return (await withPropertyDetails(db, orgId, kind, candidates)) as (MatchableProperty & { slug: string | null; mainImage: string | null; location: string | null; name: string | null })[]
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
  return scoreAcrossCatalogs(event, orgId, matchable, requirementId, opts)
}

/**
 * El recorrido común de Necesidad → inmuebles: prefiltro SQL en cada
 * catálogo, el MISMO motor (`evaluateMatch`) y orden por score. Con
 * `requirementId` adjunta lo ya decidido sobre cada par; sin él (búsqueda
 * exploratoria) no lee ni escribe ningún match.
 */
async function scoreAcrossCatalogs(
  event: H3Event,
  orgId: number,
  matchable: MatchableRequirement,
  requirementId: number | null,
  opts: { includeIneligible?: boolean; limit?: number },
): Promise<{ requirement: MatchableRequirement; results: ScoredProperty[]; scanned: number }> {
  const results: ScoredProperty[] = []
  let scanned = 0

  for (const kind of PROPERTY_KINDS) {
    const candidates = await candidatesInCatalog(event, orgId, kind, matchable)
    scanned += candidates.length
    const byProperty = requirementId ? await persistedMatchesForRequirement(event, orgId, kind, requirementId) : new Map<number, any>()

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

/** Criterios de una búsqueda exploratoria: los mismos campos que una necesidad guardada, sin persona ni id. */
export interface ExploratoryCriteria {
  operation: string
  propertyTypes?: string[]
  priceMin?: number | null
  priceMax?: number | null
  areaMin?: number | null
  areaMax?: number | null
  bedroomsMin?: number | null
  bathroomsMin?: number | null
  desiredZones?: ZoneRef[]
}

/**
 * FASE 30 (núcleo N8a): compatibilidad de una necesidad NO guardada — los
 * criterios de una búsqueda exploratoria de INMO o de la tool `find_matches`
 * —, evaluada con el mismo motor y el mismo prefiltro que una necesidad
 * guardada. No persiste NADA: ni necesidad, ni matches, ni actividad. Las
 * importancias son las del catálogo por defecto (el tipo imprescindible, el
 * resto preferible), igual que una necesidad recién creada sin tocar.
 */
export async function findPropertiesForCriteria(
  event: H3Event,
  orgId: number,
  criteria: ExploratoryCriteria,
  opts: { includeIneligible?: boolean; limit?: number } = {},
): Promise<{ requirement: MatchableRequirement; results: ScoredProperty[]; scanned: number }> {
  const matchable: MatchableRequirement = {
    id: 0,
    operation: criteria.operation,
    propertyTypes: criteria.propertyTypes ?? [],
    priceMin: criteria.priceMin ?? null,
    priceMax: criteria.priceMax ?? null,
    areaMin: criteria.areaMin ?? null,
    areaMax: criteria.areaMax ?? null,
    bedroomsMin: criteria.bedroomsMin ?? null,
    bathroomsMin: criteria.bathroomsMin ?? null,
    desiredZones: criteria.desiredZones ?? [],
    excludedZones: [],
    centerLat: null,
    centerLng: null,
    radiusKm: null,
    conditionPref: null,
    buildPref: null,
    criteria: [],
  }
  return scoreAcrossCatalogs(event, orgId, matchable, null, opts)
}

export interface ScoredRequirement {
  requirement: MatchableRequirement & { title: string; contactId: number; assignedCommercialId: number | null; status: string }
  contact: { id: number; name: string; email: string | null; phone: string | null; whatsapp: string | null } | null
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

  // En la papelera: no se buscan compradores para ella (el endpoint responde 404).
  const row = (await db.select().from(P).where(and(eq(P.id, propertyId), eq(P.organizationId, orgId), livePropertyCond(P))).limit(1))[0]
  if (!row) return null
  const [property] = await withPropertyDetails(db, orgId, kind, [row])

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
  const contacts = await selectInChunks(contactIds, (part) =>
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone, whatsapp: schema.contacts.whatsapp })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.organizationId, orgId), inArray(schema.contacts.id, part))),
  )
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

/**
 * Error de una decisión sobre un match. `statusCode` 404 cuando la necesidad
 * o el inmueble no existen en esta organización (a otra agencia se le
 * responde igual que si no existieran) y 422 cuando la decisión no es válida.
 */
export class MatchStatusError extends Error {
  constructor(
    message: string,
    readonly statusCode: 404 | 422 = 422,
  ) {
    super(message)
  }
}

/**
 * El cuerpo real de guardar la decisión sobre un par (necesidad, inmueble) —
 * compartido por `setMatchStatus()` (guardado, sólo estados manuales) y
 * `markMatchSent()` (sin guarda, sólo lo llama el Centro de Comunicaciones
 * tras un envío real). El score y el desglose se recalculan aquí con el
 * motor y NO se aceptan del cliente: si el navegador pudiera mandar el
 * score, el histórico diría lo que quisiera quien llamó a la API.
 */
async function upsertMatchStatus(
  event: H3Event,
  orgId: number,
  input: { buyerRequirementId: number; propertyId: number; propertyKind: PropertyKind; status: MatchStatus; discardedReason?: string | null },
  opts: { userId?: number | null } = {},
) {
  const db = useDb(event)
  const { property: P, match: M } = tablesFor(input.propertyKind)

  const requirement = (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, input.buyerRequirementId), eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
      .limit(1)
  )[0]
  if (!requirement) throw new MatchStatusError('Necesidad no encontrada', 404)

  const row = (await db.select().from(P).where(and(eq(P.id, input.propertyId), eq(P.organizationId, orgId))).limit(1))[0]
  if (!row) throw new MatchStatusError('Inmueble no encontrado', 404)
  // Una decisión nueva (seleccionar, descartar, marcar enviado) sobre una
  // propiedad en la papelera no tiene sentido: primero se restaura.
  if (row.deletedAt) throw new MatchStatusError('El inmueble está en la papelera: restáuralo antes de decidir sobre este match.')
  const [property] = await withPropertyDetails(db, orgId, input.propertyKind, [row])

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

  const match = (
    await db
      .select()
      .from(M)
      .where(and(eq(M.organizationId, orgId), eq(M.buyerRequirementId, input.buyerRequirementId), eq(M.propertyId, input.propertyId)))
      .limit(1)
  )[0]

  if (input.status === 'selected' || input.status === 'discarded') {
    await recordActivity(db, orgId, {
      eventType: input.status === 'selected' ? 'MATCH_SELECTED' : 'MATCH_DISCARDED',
      entityType: 'property_match',
      entityId: match.id,
      contactId: requirement.contactId,
      buyerRequirementId: input.buyerRequirementId,
      propertyId: input.propertyId,
      propertyKind: input.propertyKind,
      actorType: opts.userId ? 'user' : 'system',
      actorId: opts.userId ?? null,
      metadata: input.status === 'discarded' ? { reason: input.discardedReason ?? null } : undefined,
    })
  }

  return match
}

/** Guarda una decisión comercial manual — sólo los estados que de verdad se pueden fijar a mano (§48 arriba). */
export async function setMatchStatus(
  event: H3Event,
  orgId: number,
  input: { buyerRequirementId: number; propertyId: number; propertyKind: PropertyKind; status: MatchStatus; discardedReason?: string | null },
  opts: { userId?: number | null } = {},
) {
  if (!MANUAL_STATUSES.includes(input.status)) {
    // No se marca como enviado/visitado/ofertado algo que el sistema no ha
    // registrado de verdad. Esos estados llegarán cuando exista el envío real
    // (Comunicaciones), la visita (Appointment) y la oferta (Offer).
    throw new MatchStatusError(
      `El estado "${input.status}" no se puede fijar a mano: lo marcará el módulo que registre la acción real (envío, visita u oferta).`,
    )
  }
  return upsertMatchStatus(event, orgId, input, opts)
}

/**
 * Marca un match como `sent` — FASE 29 §126-127: "PropertyMatch pasa a SENT
 * sólo cuando el envío real se haya completado". El único llamador legítimo
 * es `share-property.post.ts`, después de que `sendOutbound()` ya haya
 * confirmado el envío — nunca se expone `status: 'sent'` a un endpoint que
 * lo reciba directamente del cliente (por eso vive fuera de
 * `setMatchStatus()`, sin su guarda de MANUAL_STATUSES).
 */
/** Orden comercial de un PropertyMatch vivo; `discarded` queda fuera a propósito. */
const MATCH_PROGRESS: Record<string, number> = { new: 0, selected: 1, sent: 2, viewing: 3, offered: 4 }

/**
 * Refleja en el PropertyMatch lo que ya ocurrió de verdad en otro dominio
 * (FASE 34, §158 paso 27): una visita con resultado lo lleva a `viewing`
 * (o a `discarded` si el comprador dijo que no le interesa) y una oferta a
 * `offered`. Reglas:
 *  - sólo hacia delante — nunca devuelve un `offered` a `viewing`;
 *  - un descarte es una decisión de una persona: no se resucita;
 *  - nunca crea un match que nadie hizo: si no existe, no hay nada que reflejar.
 * Con `buyerRequirementId` se toca sólo ese par; si no, los de esa persona y esa propiedad.
 */
export async function advancePropertyMatches(
  db: any,
  orgId: number,
  input: { contactId?: number | null; buyerRequirementId?: number | null; propertyId: number; propertyKind: PropertyKind; to: 'viewing' | 'offered' | 'discarded'; reason?: string | null },
): Promise<number> {
  if (!input.contactId && !input.buyerRequirementId) return 0
  const { match: M } = tablesFor(input.propertyKind)
  const conds = [eq(M.organizationId, orgId), eq(M.propertyId, input.propertyId)]
  conds.push(input.buyerRequirementId ? eq(M.buyerRequirementId, input.buyerRequirementId) : eq(M.contactId, input.contactId))
  const rows = await db.select({ id: M.id, status: M.status }).from(M).where(and(...conds))
  let changed = 0
  for (const r of rows) {
    if (r.status === 'discarded') continue
    if (input.to !== 'discarded' && (MATCH_PROGRESS[r.status] ?? 0) >= MATCH_PROGRESS[input.to]) continue
    await db
      .update(M)
      .set({ status: input.to, discardedReason: input.to === 'discarded' ? input.reason || null : null, updatedAt: now() })
      .where(and(eq(M.id, r.id), eq(M.organizationId, orgId)))
    changed++
  }
  return changed
}

export async function markMatchSent(
  event: H3Event,
  orgId: number,
  input: { buyerRequirementId: number; propertyId: number; propertyKind: PropertyKind },
  opts: { userId?: number | null } = {},
) {
  // Sólo hacia delante (núcleo N4: «Enviar propiedad» se puede pulsar desde
  // cualquier vista del matching): volver a mandar un inmueble ya visitado u
  // ofertado no devuelve el match a «enviado», y un descarte —decisión de
  // una persona— no se resucita por un envío.
  const db = useDb(event)
  const { match: M } = tablesFor(input.propertyKind)
  const [existing] = await db
    .select()
    .from(M)
    .where(and(eq(M.organizationId, orgId), eq(M.buyerRequirementId, input.buyerRequirementId), eq(M.propertyId, input.propertyId)))
    .limit(1)
  if (existing && (existing.status === 'discarded' || (MATCH_PROGRESS[existing.status] ?? 0) > MATCH_PROGRESS.sent)) return existing
  return upsertMatchStatus(event, orgId, { ...input, status: 'sent' }, opts)
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

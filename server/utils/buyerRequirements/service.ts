import { and, desc, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'

/**
 * BuyerRequirement — la necesidad inmobiliaria (FASE 10, migración 0066).
 *
 * Una persona puede tener varias a la vez (vivienda habitual, inversión,
 * local) con criterios distintos, por eso es una entidad propia y no un
 * bloque de campos dentro de Contact.
 *
 * Regla que atraviesa todo el archivo: **ausencia ≠ negación**. Si no se
 * especifica precio máximo, `priceMax` queda a NULL, que significa "no
 * especificado" — nunca 0, y nunca "no quiere pagar nada". Lo mismo con las
 * características: no pedir garaje no es pedir que NO tenga garaje.
 */

export const STATUSES = ['active', 'paused', 'fulfilled', 'archived'] as const
export const OPERATIONS = ['sale', 'rent'] as const
export const IMPORTANCES = ['required', 'preferred', 'indifferent'] as const
export const URGENCIES = ['low', 'medium', 'high', 'urgent'] as const
export const BUILD_PREFS = ['new', 'second_hand', 'renovated'] as const
export const CONDITION_PREFS = ['good', 'to_reform', 'any'] as const
export const MORTGAGE_STATUSES = ['not_needed', 'required', 'requested', 'preapproved', 'approved'] as const

/** Los tipos estables del catálogo. Coinciden con developer_properties.property_type_main y agent_properties.property_type. */
export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio'] as const

/**
 * Criterios que viven en la tabla de criterios (los que no tienen columna
 * propia en buyer_requirements). Los valores numéricos principales — precio,
 * superficie, habitaciones — sí son columnas indexables, y aquí sólo se
 * guarda su importancia.
 */
export const FEATURE_CRITERIA = ['terrace', 'elevator', 'garage', 'pool', 'garden'] as const

export type Importance = (typeof IMPORTANCES)[number]

export interface ZoneRef {
  /** Referencia al catálogo cuando existe; si no, los campos de texto estructurado. */
  communityId?: number
  locationId?: number
  city?: string
  district?: string
  postalCode?: string
  label?: string
}

export interface BuyerRequirementInput {
  contactId: number
  title?: string
  status?: string
  operation?: string
  propertyTypes?: string[]
  priceMin?: number | null
  priceMax?: number | null
  areaMin?: number | null
  areaMax?: number | null
  bedroomsMin?: number | null
  bathroomsMin?: number | null
  desiredZones?: ZoneRef[]
  excludedZones?: ZoneRef[]
  centerLat?: number | null
  centerLng?: number | null
  radiusKm?: number | null
  conditionPref?: string | null
  buildPref?: string | null
  desiredDate?: string | null
  needsMortgage?: number | null
  mortgageStatus?: string | null
  financingNotes?: string | null
  urgency?: string | null
  notes?: string | null
  assignedCommercialId?: number | null
  /** Importancia por criterio: { terrace: 'required', elevator: 'preferred', price: 'required' }. */
  importances?: Record<string, Importance>
  /** Características pedidas explícitamente: { terrace: true }. Una ausente queda sin declarar, no a false. */
  features?: Record<string, boolean>
}

export class BuyerRequirementValidationError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BuyerRequirementValidationError(message)
}

/** Valida lo que el dominio exige. Se ejecuta en el servidor siempre, aunque el formulario ya haya validado. */
export function validateBuyerRequirement(input: BuyerRequirementInput) {
  assert(Number.isFinite(input.contactId) && input.contactId > 0, 'contactId es obligatorio')
  if (input.status !== undefined) assert(STATUSES.includes(input.status as any), 'status no reconocido')
  if (input.operation !== undefined) assert(OPERATIONS.includes(input.operation as any), 'operation debe ser sale o rent')

  for (const t of input.propertyTypes || []) {
    assert(PROPERTY_TYPES.includes(t as any), `Tipo de inmueble no reconocido: ${t}`)
  }

  // min <= max, con ambos opcionales. Si sólo hay uno, no hay nada que comparar.
  if (input.priceMin != null && input.priceMax != null) {
    assert(input.priceMin <= input.priceMax, 'El precio mínimo no puede superar al máximo')
  }
  if (input.areaMin != null && input.areaMax != null) {
    assert(input.areaMin <= input.areaMax, 'La superficie mínima no puede superar a la máxima')
  }
  for (const [label, value] of [
    ['precio mínimo', input.priceMin],
    ['precio máximo', input.priceMax],
    ['superficie mínima', input.areaMin],
    ['superficie máxima', input.areaMax],
    ['radio', input.radiusKm],
  ] as const) {
    if (value != null) assert(value >= 0, `El ${label} no puede ser negativo`)
  }
  for (const [label, value] of [
    ['habitaciones', input.bedroomsMin],
    ['baños', input.bathroomsMin],
  ] as const) {
    if (value != null) assert(Number.isInteger(value) && value >= 0, `El número de ${label} debe ser un entero no negativo`)
  }

  if (input.urgency != null) assert(URGENCIES.includes(input.urgency as any), 'Urgencia no reconocida')
  if (input.buildPref != null) assert(BUILD_PREFS.includes(input.buildPref as any), 'Preferencia de obra no reconocida')
  if (input.conditionPref != null) assert(CONDITION_PREFS.includes(input.conditionPref as any), 'Preferencia de estado no reconocida')
  if (input.mortgageStatus != null) assert(MORTGAGE_STATUSES.includes(input.mortgageStatus as any), 'Estado de hipoteca no reconocido')

  // El radio necesita centro: un radio sin punto de partida no significa nada.
  if (input.radiusKm != null) {
    assert(input.centerLat != null && input.centerLng != null, 'Un radio de búsqueda necesita coordenadas de centro')
  }

  for (const [criterion, importance] of Object.entries(input.importances || {})) {
    assert(IMPORTANCES.includes(importance), `Importancia no reconocida para ${criterion}: ${importance}`)
  }
}

function criteriaRowsFor(input: BuyerRequirementInput, orgId: number, requirementId: number) {
  const nowTs = now()
  const rows: (typeof schema.buyerRequirementCriteria.$inferInsert)[] = []
  const importances = input.importances || {}
  const features = input.features || {}

  // Características: sólo se guarda lo que se ha pedido explícitamente. Una
  // característica que el comprador no mencionó no se convierte en un
  // criterio `false` — el matching debe poder distinguir "no le importa" de
  // "no la quiere".
  for (const feature of FEATURE_CRITERIA) {
    const wanted = features[feature]
    const importance = importances[feature]
    if (wanted === undefined && !importance) continue
    if (importance === 'indifferent') continue
    rows.push({
      organizationId: orgId,
      buyerRequirementId: requirementId,
      criterionType: feature,
      operator: 'eq',
      valueBool: wanted === false ? 0 : 1,
      importance: importance || 'preferred',
      createdAt: nowTs,
    })
  }

  // Importancia de los criterios que sí tienen columna propia. El valor no se
  // duplica aquí: vive en buyer_requirements y esta fila sólo dice cuánto
  // pesa.
  for (const criterion of ['price', 'area', 'bedrooms', 'bathrooms', 'zone', 'build', 'condition'] as const) {
    const importance = importances[criterion]
    if (!importance || importance === 'indifferent') continue
    rows.push({
      organizationId: orgId,
      buyerRequirementId: requirementId,
      criterionType: criterion,
      operator: 'eq',
      importance,
      createdAt: nowTs,
    })
  }

  return rows
}

export async function createBuyerRequirement(
  event: H3Event,
  orgId: number,
  input: BuyerRequirementInput,
  opts: { createdBy?: number | null } = {},
) {
  validateBuyerRequirement(input)
  const db = useDb(event)

  // El Contact tiene que existir y ser de esta organización: sin esto, un id
  // de otra agencia colaría una necesidad en la ficha equivocada.
  const contact = (
    await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, input.contactId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
      .limit(1)
  )[0]
  assert(contact, 'Contacto no encontrado')

  const nowTs = now()
  const [requirement] = await db
    .insert(schema.buyerRequirements)
    .values({
      organizationId: orgId,
      contactId: input.contactId,
      assignedCommercialId: input.assignedCommercialId ?? null,
      title: (input.title || '').trim(),
      status: 'active',
      operation: input.operation || 'sale',
      propertyTypesJson: JSON.stringify(input.propertyTypes || []),
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      areaMin: input.areaMin ?? null,
      areaMax: input.areaMax ?? null,
      bedroomsMin: input.bedroomsMin ?? null,
      bathroomsMin: input.bathroomsMin ?? null,
      desiredZonesJson: JSON.stringify(input.desiredZones || []),
      excludedZonesJson: JSON.stringify(input.excludedZones || []),
      centerLat: input.centerLat ?? null,
      centerLng: input.centerLng ?? null,
      radiusKm: input.radiusKm ?? null,
      conditionPref: input.conditionPref ?? null,
      buildPref: input.buildPref ?? null,
      desiredDate: input.desiredDate ?? null,
      needsMortgage: input.needsMortgage ?? null,
      mortgageStatus: input.mortgageStatus ?? null,
      financingNotes: input.financingNotes ?? null,
      // budgetValidated NO se toca aquí: lo marca validateBudget(), que deja
      // autor y fecha. Que alguien escriba un presupuesto no lo valida.
      budgetValidated: 0,
      urgency: input.urgency ?? null,
      notes: input.notes ?? null,
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  const criteria = criteriaRowsFor(input, orgId, requirement.id)
  if (criteria.length) await db.insert(schema.buyerRequirementCriteria).values(criteria)

  return requirement
}

export async function updateBuyerRequirement(
  event: H3Event,
  orgId: number,
  requirementId: number,
  input: Partial<BuyerRequirementInput>,
) {
  const db = useDb(event)
  const existing = (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!existing) return null

  const merged = { ...existing, ...input, contactId: existing.contactId } as BuyerRequirementInput
  validateBuyerRequirement(merged)

  const patch: Record<string, unknown> = { updatedAt: now() }
  const direct: (keyof BuyerRequirementInput)[] = [
    'title', 'status', 'operation', 'priceMin', 'priceMax', 'areaMin', 'areaMax', 'bedroomsMin', 'bathroomsMin',
    'centerLat', 'centerLng', 'radiusKm', 'conditionPref', 'buildPref', 'desiredDate', 'needsMortgage',
    'mortgageStatus', 'financingNotes', 'urgency', 'notes', 'assignedCommercialId',
  ]
  for (const key of direct) if (input[key] !== undefined) patch[key] = input[key]
  if (input.propertyTypes !== undefined) patch.propertyTypesJson = JSON.stringify(input.propertyTypes)
  if (input.desiredZones !== undefined) patch.desiredZonesJson = JSON.stringify(input.desiredZones)
  if (input.excludedZones !== undefined) patch.excludedZonesJson = JSON.stringify(input.excludedZones)

  await db
    .update(schema.buyerRequirements)
    .set(patch)
    .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))

  // Los criterios se reemplazan en bloque cuando el formulario los envía:
  // conservar los antiguos dejaría importancias huérfanas de criterios que
  // el comprador ya no pide.
  if (input.importances !== undefined || input.features !== undefined) {
    await db.delete(schema.buyerRequirementCriteria).where(eq(schema.buyerRequirementCriteria.buyerRequirementId, requirementId))
    const rows = criteriaRowsFor({ ...merged, ...input } as BuyerRequirementInput, orgId, requirementId)
    if (rows.length) await db.insert(schema.buyerRequirementCriteria).values(rows)
  }

  return (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))
      .limit(1)
  )[0]
}

/** Marcar el presupuesto como validado es una acción con autor y fecha, no un checkbox suelto. */
export async function validateBudget(event: H3Event, orgId: number, requirementId: number, userId: number, validated: boolean) {
  const db = useDb(event)
  await db
    .update(schema.buyerRequirements)
    .set({
      budgetValidated: validated ? 1 : 0,
      budgetValidatedAt: validated ? now() : null,
      budgetValidatedBy: validated ? userId : null,
      updatedAt: now(),
    })
    .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))
  // La lectura va acotada por organización igual que la escritura. Con el id
  // suelto, pedir el id de otra agencia devolvía su necesidad entera con un
  // 200 aunque el UPDATE no hubiera tocado nada.
  return (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))
      .limit(1)
  )[0]
}

export async function listBuyerRequirements(event: H3Event, orgId: number, opts: { contactId?: number } = {}) {
  const db = useDb(event)
  const where = opts.contactId
    ? and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, opts.contactId), isNull(schema.buyerRequirements.deletedAt))
    : and(eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt))

  const rows = await db.select().from(schema.buyerRequirements).where(where).orderBy(desc(schema.buyerRequirements.id))
  if (!rows.length) return []

  const criteria = await db
    .select()
    .from(schema.buyerRequirementCriteria)
    .where(eq(schema.buyerRequirementCriteria.organizationId, orgId))

  const byRequirement = new Map<number, typeof criteria>()
  for (const c of criteria) {
    const list = byRequirement.get(c.buyerRequirementId) || []
    list.push(c)
    byRequirement.set(c.buyerRequirementId, list)
  }

  return rows.map((r) => ({
    ...r,
    propertyTypes: safeParse<string[]>(r.propertyTypesJson, []),
    desiredZones: safeParse<ZoneRef[]>(r.desiredZonesJson, []),
    excludedZones: safeParse<ZoneRef[]>(r.excludedZonesJson, []),
    criteria: byRequirement.get(r.id) || [],
  }))
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * El resumen legible de una necesidad, construido desde los datos
 * estructurados — nunca escrito a mano ni generado por un modelo:
 * "Compra · Piso/Ático · Chamberí · ≤ 650.000 € · ≥ 2 dorm. · Terraza imprescindible".
 */
export function summarizeRequirement(requirement: {
  operation: string
  propertyTypes?: string[]
  desiredZones?: ZoneRef[]
  priceMax?: number | null
  priceMin?: number | null
  bedroomsMin?: number | null
  criteria?: { criterionType: string; importance: string; valueBool?: number | null }[]
}): string {
  const parts: string[] = [requirement.operation === 'rent' ? 'Alquiler' : 'Compra']

  if (requirement.propertyTypes?.length) parts.push(requirement.propertyTypes.join('/'))

  const zones = (requirement.desiredZones || []).map((z) => z.label || z.district || z.city).filter(Boolean)
  if (zones.length) parts.push(zones.join(' + '))

  const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  if (requirement.priceMax != null) parts.push(`≤ ${money(requirement.priceMax)}`)
  else if (requirement.priceMin != null) parts.push(`≥ ${money(requirement.priceMin)}`)

  if (requirement.bedroomsMin != null) parts.push(`≥ ${requirement.bedroomsMin} dorm.`)

  const labels: Record<string, string> = { terrace: 'Terraza', elevator: 'Ascensor', garage: 'Garaje', pool: 'Piscina', garden: 'Jardín' }
  for (const c of requirement.criteria || []) {
    const label = labels[c.criterionType]
    if (!label || c.valueBool === 0) continue
    if (c.importance === 'required') parts.push(`${label} imprescindible`)
    else if (c.importance === 'preferred') parts.push(`${label} preferible`)
  }

  return parts.join(' · ')
}

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { recordActivity } from '../activity/service'
import { recomputeLeadScoresForContact } from '../leads/score'
import { selectInChunks } from '../sqlChunks'
import {
  BUILD_PREFS,
  CONDITION_PREFS,
  CRITERION_LABELS,
  FEATURE_CRITERIA,
  IMPORTANCE_CRITERIA,
  IMPORTANCES,
  MORTGAGE_STATUSES,
  REQUIREMENT_OPERATIONS,
  REQUIREMENT_STATUSES,
  URGENCIES,
  VALUE_CRITERIA,
  allowedImportances,
  zoneLabel,
} from '../../../utils/buyerRequirementCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '../../../utils/propertySheet'

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
 *
 * Los vocabularios (estados, urgencias, importancias, criterios…) y sus
 * etiquetas viven en `utils/buyerRequirementCatalog.ts`, compartido con el
 * editor del panel: aquí sólo se reexportan para no romper a quien ya los
 * importaba de este módulo.
 */

export const STATUSES = REQUIREMENT_STATUSES
export const OPERATIONS = REQUIREMENT_OPERATIONS
export { BUILD_PREFS, CONDITION_PREFS, FEATURE_CRITERIA, IMPORTANCES, MORTGAGE_STATUSES, URGENCIES }

/**
 * Los tipos de inmueble son los del catálogo común de los dos catálogos de
 * propiedades (`utils/propertySheet.ts`). Antes sólo se aceptaban cinco
 * (Apartment, Villa, Townhouse, Penthouse, Studio); siguen siendo válidos —
 * son un subconjunto del catálogo común —, así que lo ya guardado no cambia.
 */
export { PROPERTY_TYPES }

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
  /**
   * Importancia por criterio (catálogo `IMPORTANCE_CRITERIA`):
   * { propertyType: 'required', price: 'preferred', terrace: 'required', … }.
   */
  importances?: Record<string, Importance>
  /**
   * Características pedidas explícitamente: { terrace: true } la quiere,
   * { pool: false } la quiere SIN. Una ausente queda sin declarar, nunca a false.
   */
  features?: Record<string, boolean>
}

/**
 * Error de dominio. `statusCode` 422 para un dato inválido y 404 para una
 * referencia (contacto) que no existe en esta organización: a quien llama
 * desde otra agencia se le responde igual que si no existiera.
 */
export class BuyerRequirementValidationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 404 | 422 = 422,
  ) {
    super(message)
  }
}

function assert(condition: unknown, message: string, statusCode: 404 | 422 = 422): asserts condition {
  if (!condition) throw new BuyerRequirementValidationError(message, statusCode)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ZONES = 30
const ZONE_TEXT_MAX = 120

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Una zona es una referencia estructurada con al menos un dato; nunca un texto con varias zonas dentro. */
function validateZones(zones: unknown, what: string) {
  if (zones === undefined) return
  assert(Array.isArray(zones), `${what}: debe ser una lista de zonas`)
  assert(zones.length <= MAX_ZONES, `${what}: máximo ${MAX_ZONES} zonas`)
  for (const zone of zones as unknown[]) {
    assert(zone && typeof zone === 'object' && !Array.isArray(zone), `${what}: cada zona debe ser una referencia estructurada`)
    const z = zone as Record<string, unknown>
    for (const key of ['city', 'district', 'postalCode', 'label'] as const) {
      if (z[key] === undefined || z[key] === null) continue
      assert(typeof z[key] === 'string' && String(z[key]).length <= ZONE_TEXT_MAX, `${what}: «${key}» debe ser un texto de hasta ${ZONE_TEXT_MAX} caracteres`)
    }
    for (const key of ['communityId', 'locationId'] as const) {
      if (z[key] === undefined || z[key] === null) continue
      assert(Number.isInteger(z[key]) && (z[key] as number) > 0, `${what}: «${key}» debe ser un identificador`)
    }
    const filled = ['city', 'district', 'postalCode', 'label'].some((k) => typeof z[k] === 'string' && String(z[k]).trim()) || z.communityId || z.locationId
    assert(filled, `${what}: hay una zona vacía`)
  }
}

/**
 * Clave comparable de una zona, para detectar la misma zona deseada y
 * excluida a la vez: su referencia principal (urbanización del catálogo,
 * distrito, localidad, CP o nombre libre), sin tildes ni mayúsculas. La
 * etiqueta que acompaña a un distrito no cuenta: {district: X} y
 * {district: X, label: X} son la misma zona.
 */
function zoneKey(zone: ZoneRef): string {
  const norm = (v: unknown) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  if (zone.communityId) return `community:${zone.communityId}`
  if (zone.locationId) return `location:${zone.locationId}`
  if (zone.district) return `district:${norm(zone.district)}`
  if (zone.city) return `city:${norm(zone.city)}`
  if (zone.postalCode) return `postalCode:${norm(zone.postalCode)}`
  return `label:${norm(zone.label)}`
}

/** Valida lo que el dominio exige. Se ejecuta en el servidor siempre, aunque el formulario ya haya validado. */
export function validateBuyerRequirement(input: BuyerRequirementInput) {
  assert(Number.isFinite(input.contactId) && input.contactId > 0, 'contactId es obligatorio')
  if (input.status !== undefined) assert(STATUSES.includes(input.status as any), 'status no reconocido')
  if (input.operation !== undefined) assert(OPERATIONS.includes(input.operation as any), 'operation debe ser sale o rent')
  if (input.title != null) assert(typeof input.title === 'string' && input.title.length <= 200, 'El título admite hasta 200 caracteres')

  if (input.propertyTypes !== undefined) assert(Array.isArray(input.propertyTypes), 'Los tipos de inmueble deben ser una lista')
  for (const t of input.propertyTypes || []) {
    assert(PROPERTY_TYPES.includes(t as any), `Tipo de inmueble no reconocido: ${t}`)
  }

  for (const [label, value] of [
    ['precio mínimo', input.priceMin],
    ['precio máximo', input.priceMax],
    ['superficie mínima', input.areaMin],
    ['superficie máxima', input.areaMax],
    ['radio', input.radiusKm],
    ['número de habitaciones', input.bedroomsMin],
    ['número de baños', input.bathroomsMin],
  ] as const) {
    if (value != null) assert(isFiniteNumber(value), `El ${label} debe ser un número`)
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
  if (input.needsMortgage != null) assert(input.needsMortgage === 0 || input.needsMortgage === 1, '«Necesita financiación» debe ser sí, no o sin especificar')
  if (input.desiredDate != null) {
    assert(typeof input.desiredDate === 'string' && DATE_RE.test(input.desiredDate) && !Number.isNaN(Date.parse(input.desiredDate)), 'Fecha deseada inválida (AAAA-MM-DD)')
  }
  if (input.financingNotes != null) assert(typeof input.financingNotes === 'string' && input.financingNotes.length <= 2000, 'Las notas de financiación admiten hasta 2000 caracteres')
  if (input.notes != null) assert(typeof input.notes === 'string' && input.notes.length <= 4000, 'Las notas admiten hasta 4000 caracteres')

  // El radio necesita centro: un radio sin punto de partida no significa nada.
  if (input.radiusKm != null) {
    assert(input.centerLat != null && input.centerLng != null, 'Un radio de búsqueda necesita coordenadas de centro')
  }
  if (input.centerLat != null) assert(isFiniteNumber(input.centerLat) && input.centerLat >= -90 && input.centerLat <= 90, 'La latitud del centro debe estar entre -90 y 90')
  if (input.centerLng != null) assert(isFiniteNumber(input.centerLng) && input.centerLng >= -180 && input.centerLng <= 180, 'La longitud del centro debe estar entre -180 y 180')

  validateZones(input.desiredZones, 'Zonas deseadas')
  validateZones(input.excludedZones, 'Zonas excluidas')
  if (input.desiredZones?.length && input.excludedZones?.length) {
    const desired = new Set(input.desiredZones.map(zoneKey))
    const both = input.excludedZones.find((z) => desired.has(zoneKey(z)))
    assert(!both, `«${both ? zoneLabel(both) : ''}» no puede ser a la vez zona deseada y excluida`)
  }

  for (const [criterion, importance] of Object.entries(input.importances || {})) {
    assert((IMPORTANCE_CRITERIA as readonly string[]).includes(criterion), `Criterio no reconocido: ${criterion}`)
    assert(IMPORTANCES.includes(importance), `Importancia no reconocida para ${criterion}: ${importance}`)
    assert(
      allowedImportances(criterion).includes(importance),
      `${CRITERION_LABELS[criterion] || criterion} no puede ser «indiferente»: si no importa, déjalo en blanco`,
    )
  }
  for (const [feature, wanted] of Object.entries(input.features || {})) {
    assert((FEATURE_CRITERIA as readonly string[]).includes(feature), `Característica no reconocida: ${feature}`)
    assert(typeof wanted === 'boolean', `La característica ${feature} debe ser sí o no`)
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
  // "no la quiere". Una característica «indiferente» tampoco se guarda: es
  // exactamente lo mismo que no haberla mencionado.
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
  // pesa. Aquí «indiferente» SÍ se guarda: el tipo de inmueble es
  // imprescindible por defecto (DEFAULT_IMPORTANCE), así que «no le importa
  // el tipo» tiene que quedar escrito para poder distinguirlo de «no lo ha
  // dicho».
  for (const criterion of VALUE_CRITERIA) {
    const importance = importances[criterion]
    if (!importance) continue
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
  assert(contact, 'Contacto no encontrado', 404)
  await assertCommercialInOrg(db, orgId, input.assignedCommercialId)

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

  await recordActivity(db, orgId, {
    eventType: 'BUYER_REQUIREMENT_CREATED',
    entityType: 'buyer_requirement',
    entityId: requirement.id,
    contactId: input.contactId,
    buyerRequirementId: requirement.id,
    actorType: opts.createdBy ? 'user' : 'system',
    actorId: opts.createdBy ?? null,
    metadata: { title: requirement.title },
  })
  await refreshContactLeadScores(db, orgId, input.contactId)

  return requirement
}

/** El comercial asignado tiene que ser de esta agencia: un id ajeno colgaría la necesidad de alguien que nadie de aquí puede ver. */
async function assertCommercialInOrg(db: any, orgId: number, commercialId: number | null | undefined) {
  if (commercialId == null) return
  assert(Number.isInteger(commercialId) && commercialId > 0, 'Comercial inválido')
  const [row] = await db
    .select({ id: schema.teamMembers.id })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, commercialId), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  assert(row, 'Comercial no encontrado', 404)
}

/**
 * FASE 32 — presupuesto validado, fecha deseada, urgencia y financiación
 * son señales del Lead Score de los leads de esta persona. Nunca deshace la
 * escritura de la necesidad si el recálculo falla.
 */
async function refreshContactLeadScores(db: any, orgId: number, contactId: number) {
  try {
    await recomputeLeadScoresForContact(db, orgId, contactId, 'signal')
  } catch {
    // Se recalculará con la próxima señal o desde la ficha del lead.
  }
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

  // Lo guardado se combina con lo que llega para validar las reglas que
  // cruzan campos (mínimo ≤ máximo, radio con centro, zona deseada y
  // excluida a la vez). Lo guardado pasa antes por `storedAsInput()`: una fila
  // antigua con un dato mal formado no debe impedir, p. ej., pausarla.
  const merged = { ...storedAsInput(existing), ...input, contactId: existing.contactId } as BuyerRequirementInput
  validateBuyerRequirement(merged)
  await assertCommercialInOrg(db, orgId, input.assignedCommercialId)

  const patch: Record<string, unknown> = { updatedAt: now() }
  const direct: (keyof BuyerRequirementInput)[] = [
    'title', 'status', 'operation', 'priceMin', 'priceMax', 'areaMin', 'areaMax', 'bedroomsMin', 'bathroomsMin',
    'centerLat', 'centerLng', 'radiusKm', 'conditionPref', 'buildPref', 'desiredDate', 'needsMortgage',
    'mortgageStatus', 'financingNotes', 'urgency', 'notes', 'assignedCommercialId',
  ]
  for (const key of direct) if (input[key] !== undefined) patch[key] = input[key]
  if (typeof patch.title === 'string') patch.title = patch.title.trim()
  // Quitar el radio deja también sin centro: un centro suelto no filtra nada
  // y confundiría al volver a abrir el editor.
  if (input.radiusKm === null && input.centerLat === undefined && input.centerLng === undefined) {
    patch.centerLat = null
    patch.centerLng = null
  }
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
  await refreshContactLeadScores(db, orgId, existing.contactId)

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
  const row = (
    await db
      .select()
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, requirementId), eq(schema.buyerRequirements.organizationId, orgId)))
      .limit(1)
  )[0]
  if (row) await refreshContactLeadScores(db, orgId, row.contactId)
  return row
}

export async function listBuyerRequirements(event: H3Event, orgId: number, opts: { contactId?: number } = {}) {
  const db = useDb(event)
  const where = opts.contactId
    ? and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, opts.contactId), isNull(schema.buyerRequirements.deletedAt))
    : and(eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt))

  const rows = await db.select().from(schema.buyerRequirements).where(where).orderBy(desc(schema.buyerRequirements.id))
  if (!rows.length) return []

  // Por trozos: el listado de toda la agencia puede tener cientos de
  // necesidades y D1 no admite más de 100 parámetros por consulta.
  const criteria = await selectInChunks(
    rows.map((r) => r.id),
    (part) =>
      db
        .select()
        .from(schema.buyerRequirementCriteria)
        .where(and(eq(schema.buyerRequirementCriteria.organizationId, orgId), inArray(schema.buyerRequirementCriteria.buyerRequirementId, part))),
  )

  // Quién validó el presupuesto: la validación es una acción con autor, y la
  // ficha lo enseña con nombre, no con un id.
  const validatorIds = [...new Set(rows.map((r) => r.budgetValidatedBy).filter((id): id is number => typeof id === 'number'))]
  const validators = await selectInChunks(validatorIds, (part) =>
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, orgId), inArray(schema.users.id, part))),
  )
  const validatorName = new Map<number, string>(validators.map((u: { id: number; name: string }) => [u.id, u.name]))

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
    budgetValidatedByName: r.budgetValidatedBy ? validatorName.get(r.budgetValidatedBy) || null : null,
  }))
}

/** Lo guardado de una necesidad con la forma de la entrada, saneado (ver `updateBuyerRequirement`). */
function storedAsInput(row: typeof schema.buyerRequirements.$inferSelect): Partial<BuyerRequirementInput> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null)
  const oneOf = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : null)
  // Sólo zonas con algún dato: una fila antigua con basura dentro no bloquea la edición.
  const zones = (raw: string | null): ZoneRef[] => {
    const parsed = safeParse<unknown>(raw, [])
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (z): z is ZoneRef => !!z && typeof z === 'object' && ['city', 'district', 'postalCode', 'label'].some((k) => typeof (z as any)[k] === 'string' && (z as any)[k].trim()),
    )
  }
  return {
    priceMin: num(row.priceMin),
    priceMax: num(row.priceMax),
    areaMin: num(row.areaMin),
    areaMax: num(row.areaMax),
    bedroomsMin: int(row.bedroomsMin),
    bathroomsMin: int(row.bathroomsMin),
    centerLat: num(row.centerLat),
    centerLng: num(row.centerLng),
    radiusKm: num(row.radiusKm),
    conditionPref: oneOf(row.conditionPref, CONDITION_PREFS),
    buildPref: oneOf(row.buildPref, BUILD_PREFS),
    urgency: oneOf(row.urgency, URGENCIES),
    mortgageStatus: oneOf(row.mortgageStatus, MORTGAGE_STATUSES),
    desiredDate: typeof row.desiredDate === 'string' && DATE_RE.test(row.desiredDate) ? row.desiredDate : null,
    desiredZones: zones(row.desiredZonesJson),
    excludedZones: zones(row.excludedZonesJson),
  }
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
 * "Compra · Piso/Ático · Chamberí · sin Lavapiés · ≤ 650.000 € · ≥ 2 dorm. · Terraza imprescindible".
 */
export function summarizeRequirement(requirement: {
  operation: string
  propertyTypes?: string[]
  desiredZones?: ZoneRef[]
  excludedZones?: ZoneRef[]
  radiusKm?: number | null
  priceMax?: number | null
  priceMin?: number | null
  bedroomsMin?: number | null
  criteria?: { criterionType: string; importance: string; valueBool?: number | null }[]
}): string {
  const parts: string[] = [requirement.operation === 'rent' ? 'Alquiler' : 'Compra']

  // Las etiquetas del catálogo común (Piso, Ático…), nunca la clave interna.
  if (requirement.propertyTypes?.length) parts.push(requirement.propertyTypes.map((t) => PROPERTY_TYPE_LABELS[t] || t).join('/'))

  const zones = (requirement.desiredZones || []).map((z) => zoneLabel(z)).filter(Boolean)
  if (zones.length) parts.push(zones.join(' + '))
  const excluded = (requirement.excludedZones || []).map((z) => zoneLabel(z)).filter(Boolean)
  if (excluded.length) parts.push(`sin ${excluded.join(' ni ')}`)
  if (requirement.radiusKm != null) parts.push(`radio ${requirement.radiusKm} km`)

  const money = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  if (requirement.priceMax != null) parts.push(`≤ ${money(requirement.priceMax)}`)
  else if (requirement.priceMin != null) parts.push(`≥ ${money(requirement.priceMin)}`)

  if (requirement.bedroomsMin != null) parts.push(`≥ ${requirement.bedroomsMin} dorm.`)

  for (const c of requirement.criteria || []) {
    if (!(FEATURE_CRITERIA as readonly string[]).includes(c.criterionType)) continue
    const label = CRITERION_LABELS[c.criterionType]
    if (!label || c.valueBool === 0) continue
    if (c.importance === 'required') parts.push(`${label} imprescindible`)
    else if (c.importance === 'preferred') parts.push(`${label} preferible`)
  }

  return parts.join(' · ')
}

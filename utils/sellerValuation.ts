import { PROPERTY_CONDITIONS, PROPERTY_CONDITION_LABELS, PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_TYPE_GROUPS, PROPERTY_TYPE_LABELS, isSubtypeOf, propertySubtypeLabel, type PropertyTypeKey } from './propertySheet'

/**
 * Formulario de valoración de «Vender propiedad» (bloque `seller-valuation`
 * del Constructor Web).
 *
 * NO hay un segundo catálogo: los tipos y subtipos son los de Property Core
 * (`PROPERTY_TYPES` / `PROPERTY_SUBTYPES` / `PROPERTY_TYPE_GROUPS`, utils/propertySheet.ts)
 * y cada pregunta lleva el nombre real del campo de la ficha (`area`,
 * `bedrooms`, `condition`…), el mismo que declara el registro de esquemas
 * (server/utils/propertySchema/registry.ts). Una prueba comprueba las dos
 * cosas: que cada tipo de Property Core tiene preguntas y que cada pregunta
 * es un campo que el esquema de ese tipo declara.
 *
 * Aquí sólo viven datos y reglas puros (sin Vue ni servidor): los usa el
 * formulario de la web, el inspector del Constructor y /api/public/contact.
 */

export const SELLER_STEP_KEYS = ['type', 'location', 'surface', 'features', 'extra', 'contact'] as const
export type SellerStepKey = (typeof SELLER_STEP_KEYS)[number]

export const SELLER_STEP_LABELS: Record<SellerStepKey, string> = {
  type: 'Tipo de propiedad',
  location: 'Ubicación',
  surface: 'Superficie y distribución',
  features: 'Características y estado',
  extra: 'Información adicional',
  contact: 'Tus datos',
}

/** Familia de preguntas de cada tipo de Property Core: la misma que `AGENT_PROPERTY_TYPE_TO_SCHEMA` del registro (lo comprueba una prueba). */
export type SellerSchemaKey = 'residential' | 'land' | 'commercial' | 'industrial' | 'garage' | 'building'
export const SELLER_SCHEMA_OF_TYPE: Record<PropertyTypeKey, SellerSchemaKey> = {
  Apartment: 'residential',
  House: 'residential',
  Villa: 'residential',
  Townhouse: 'residential',
  Penthouse: 'residential',
  Duplex: 'residential',
  Studio: 'residential',
  Finca: 'residential',
  Development: 'building',
  Land: 'land',
  Office: 'commercial',
  Retail: 'commercial',
  Warehouse: 'industrial',
  Garage: 'garage',
  Building: 'building',
}

export type SellerQuestionStep = 'surface' | 'features' | 'extra'
export type SellerQuestionKind = 'number' | 'integer' | 'choice' | 'boolean'

export interface SellerQuestion {
  /** Nombre del campo de Property Core (o, en «extra», del propio lead). */
  key: string
  label: string
  step: SellerQuestionStep
  kind: SellerQuestionKind
  unit?: string
  min?: number
  max?: number
  options?: { value: string; label: string }[]
  /** Sólo los obligatorios de seguridad del formulario (la superficie): no se pueden ocultar en el inspector. */
  required?: boolean
  /** Si sólo aplica a algunos tipos de la familia. */
  types?: PropertyTypeKey[]
  help?: string
}

const HOUSE_TYPES: PropertyTypeKey[] = ['House', 'Villa', 'Townhouse', 'Finca']
const FLAT_TYPES: PropertyTypeKey[] = ['Apartment', 'Penthouse', 'Duplex', 'Studio']

const CONDITION_OPTIONS = PROPERTY_CONDITIONS.map((value) => ({ value, label: PROPERTY_CONDITION_LABELS[value]! }))
const ORIENTATION_OPTIONS = [
  { value: 'N', label: 'Norte' },
  { value: 'NE', label: 'Noreste' },
  { value: 'E', label: 'Este' },
  { value: 'SE', label: 'Sureste' },
  { value: 'S', label: 'Sur' },
  { value: 'SW', label: 'Suroeste' },
  { value: 'W', label: 'Oeste' },
  { value: 'NW', label: 'Noroeste' },
]
const FURNISHED_OPTIONS = [
  { value: 'yes', label: 'Amueblada' },
  { value: 'partially', label: 'Parcialmente' },
  { value: 'no', label: 'Sin amueblar' },
]

const AREA = (label: string, help?: string, key = 'area'): SellerQuestion => ({ key, label, step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 1_000_000, required: true, help })

/** Preguntas por familia: sólo campos reales de la ficha que cada esquema declara. */
const BY_SCHEMA: Record<SellerSchemaKey, SellerQuestion[]> = {
  residential: [
    AREA('Superficie construida', 'Los metros cuadrados que constan en la escritura o el recibo del IBI.'),
    { key: 'usableArea', label: 'Superficie útil', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 1_000_000 },
    { key: 'bedrooms', label: 'Habitaciones', step: 'surface', kind: 'integer', min: 0, max: 30, types: ['Apartment', 'House', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Finca'] },
    { key: 'bathrooms', label: 'Baños', step: 'surface', kind: 'integer', min: 0, max: 30 },
    { key: 'plotArea', label: 'Parcela', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 10_000_000, types: HOUSE_TYPES },
    { key: 'terraceArea', label: 'Terraza', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 100_000 },
    { key: 'condition', label: 'Estado de conservación', step: 'features', kind: 'choice', options: CONDITION_OPTIONS },
    { key: 'yearBuilt', label: 'Año de construcción', step: 'features', kind: 'integer', min: 1500, max: 2100 },
    { key: 'floor', label: 'Planta', step: 'features', kind: 'integer', min: -5, max: 100, types: FLAT_TYPES },
    { key: 'orientation', label: 'Orientación principal', step: 'features', kind: 'choice', options: ORIENTATION_OPTIONS },
    { key: 'furnished', label: 'Mobiliario', step: 'features', kind: 'choice', options: FURNISHED_OPTIONS },
    { key: 'hasElevator', label: 'Ascensor', step: 'features', kind: 'boolean', types: FLAT_TYPES },
    { key: 'hasGarage', label: 'Garaje', step: 'features', kind: 'boolean' },
    { key: 'hasTerrace', label: 'Terraza', step: 'features', kind: 'boolean' },
    { key: 'hasPool', label: 'Piscina', step: 'features', kind: 'boolean' },
    { key: 'hasGarden', label: 'Jardín', step: 'features', kind: 'boolean' },
  ],
  // En el esquema de suelo la superficie es la de la parcela (`plotArea`), no `area`.
  land: [AREA('Superficie del terreno', 'Los metros cuadrados que constan en el registro o el catastro.', 'plotArea')],
  commercial: [
    AREA('Superficie construida'),
    { key: 'usableArea', label: 'Superficie útil', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 1_000_000 },
    { key: 'toilets', label: 'Aseos', step: 'surface', kind: 'integer', min: 0, max: 50 },
    { key: 'condition', label: 'Estado de conservación', step: 'features', kind: 'choice', options: CONDITION_OPTIONS },
    { key: 'yearBuilt', label: 'Año de construcción', step: 'features', kind: 'integer', min: 1500, max: 2100 },
    { key: 'hasElevator', label: 'Ascensor', step: 'features', kind: 'boolean', types: ['Office'] },
    { key: 'hasAirConditioning', label: 'Aire acondicionado', step: 'features', kind: 'boolean' },
  ],
  industrial: [
    AREA('Superficie construida'),
    { key: 'plotArea', label: 'Parcela', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 10_000_000 },
    { key: 'ceilingHeight', label: 'Altura libre', step: 'surface', kind: 'number', unit: 'm', min: 1, max: 50 },
    { key: 'condition', label: 'Estado de conservación', step: 'features', kind: 'choice', options: CONDITION_OPTIONS },
    { key: 'yearBuilt', label: 'Año de construcción', step: 'features', kind: 'integer', min: 1500, max: 2100 },
    { key: 'hasAlarm', label: 'Alarma', step: 'features', kind: 'boolean' },
  ],
  garage: [
    AREA('Superficie'),
    { key: 'garageSpaces', label: 'Número de plazas', step: 'surface', kind: 'integer', min: 1, max: 1000 },
    { key: 'hasElevator', label: 'Acceso con ascensor', step: 'features', kind: 'boolean' },
    { key: 'accessible', label: 'Accesible', step: 'features', kind: 'boolean' },
  ],
  building: [
    AREA('Superficie construida'),
    { key: 'plotArea', label: 'Parcela', step: 'surface', kind: 'number', unit: 'm²', min: 1, max: 10_000_000 },
    { key: 'floorsCount', label: 'Plantas', step: 'surface', kind: 'integer', min: 1, max: 200 },
    { key: 'condition', label: 'Estado de conservación', step: 'features', kind: 'choice', options: CONDITION_OPTIONS },
    { key: 'yearBuilt', label: 'Año de construcción', step: 'features', kind: 'integer', min: 1500, max: 2100 },
    { key: 'hasElevator', label: 'Ascensor', step: 'features', kind: 'boolean' },
  ],
}

export const SELLER_OCCUPANCY_OPTIONS = [
  { value: 'vacant', label: 'Libre' },
  { value: 'owner_occupied', label: 'Vivo en ella' },
  { value: 'rented', label: 'Alquilada' },
]
export const SELLER_TIMEFRAME_OPTIONS = [
  { value: 'asap', label: 'Cuanto antes' },
  { value: 'months_3', label: 'En los próximos 3 meses' },
  { value: 'months_6', label: 'En los próximos 6 meses' },
  { value: 'exploring', label: 'Sólo estoy informándome' },
]

/** «Información adicional»: datos del propietario, no de la ficha. Todos opcionales. */
export const SELLER_EXTRA_QUESTIONS: SellerQuestion[] = [
  { key: 'occupancyStatus', label: '¿Cómo está ahora?', step: 'extra', kind: 'choice', options: SELLER_OCCUPANCY_OPTIONS },
  { key: 'timeframe', label: '¿Cuándo te gustaría vender?', step: 'extra', kind: 'choice', options: SELLER_TIMEFRAME_OPTIONS },
  { key: 'expectedPrice', label: 'Precio que te gustaría conseguir', step: 'extra', kind: 'number', unit: '€', min: 1, max: 1_000_000_000, help: 'Opcional. Es tu referencia, no una tasación.' },
]

/** Preguntas de un paso para un tipo concreto (las de «extra» no dependen del tipo). */
export function sellerQuestions(type: string | null | undefined, step: SellerQuestionStep): SellerQuestion[] {
  if (step === 'extra') return SELLER_EXTRA_QUESTIONS
  if (!isSellerType(type)) return []
  return BY_SCHEMA[SELLER_SCHEMA_OF_TYPE[type]].filter((q) => q.step === step && (!q.types || q.types.includes(type)))
}

/** Todas las preguntas (distintas por clave y paso) de un tipo: lo que el servidor acepta. */
export function allSellerQuestions(type: string | null | undefined): SellerQuestion[] {
  return (['surface', 'features', 'extra'] as const).flatMap((s) => sellerQuestions(type, s))
}

export function isSellerType(value: unknown): value is PropertyTypeKey {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)
}

/** Los pasos que se enseñan para un tipo: «Características» desaparece si el tipo no tiene preguntas ahí (p. ej. un terreno). */
export function sellerVisibleSteps(type: string | null | undefined, hidden: readonly string[] = []): SellerStepKey[] {
  // Sin tipo elegido todavía el recorrido es el de una vivienda (el caso común): el contador no cambia al elegir, salvo que el tipo tenga menos pasos.
  const t = isSellerType(type) ? type : 'Apartment'
  return SELLER_STEP_KEYS.filter((s) => {
    if (s === 'features' || s === 'surface') return sellerQuestionsShown(t, s, hidden).length > 0
    if (s === 'extra') return sellerQuestionsShown(t, s, hidden).length > 0
    return true
  })
}

/** Las preguntas de un paso menos las que la inmobiliaria ha ocultado (nunca las obligatorias). */
export function sellerQuestionsShown(type: string | null | undefined, step: SellerQuestionStep, hidden: readonly string[] = []): SellerQuestion[] {
  return sellerQuestions(type, step).filter((q) => q.required || !hidden.includes(q.key))
}

/** Los tipos que se ofrecen, agrupados como en el resto de la plataforma; `hiddenTypes` los quita (Constructor). */
export function sellerTypeGroups(hiddenTypes: readonly string[] = []) {
  return PROPERTY_TYPE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label[1],
    types: g.families.flatMap((f) => f.types).filter((t) => !hiddenTypes.includes(t)),
  })).filter((g) => g.types.length)
}

export function sellerSubtypes(type: string | null | undefined): { value: string; label: string }[] {
  if (!isSellerType(type)) return []
  return Object.entries(PROPERTY_SUBTYPES[type] || {}).map(([value, label]) => ({ value, label }))
}

// ---------------------------------------------------------------------------
// Lo que viaja y lo que se guarda
// ---------------------------------------------------------------------------

export interface SellerLocation {
  /** Id canónico del catálogo geográfico (`m:...`, `b:...`…) cuando se eligió una sugerencia. */
  id: string
  kind: string
  /** Texto que ve la persona («Oviedo, Asturias»). */
  label: string
}

export interface SellerValuationInput {
  propertyType: string
  subtype?: string | null
  location: SellerLocation | null
  /** Calle y número, si la persona los quiere indicar. Sólo lo ve la inmobiliaria. */
  address?: string
  answers: Record<string, string | number | boolean | null | undefined>
  photoKeys?: string[]
}

export interface SellerValuationClean {
  propertyType: PropertyTypeKey
  subtype: string | null
  location: SellerLocation
  address: string | null
  answers: Record<string, string | number | boolean>
  photoKeys: string[]
}

export const SELLER_MAX_PHOTOS = 6
export const SELLER_PHOTO_PREFIX = 'seller-uploads/'
const LOCATION_ID = /^[a-z]{1,3}:[A-Za-z0-9._\-:|]{1,120}$/

function text(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export interface SellerValidation {
  ok: boolean
  /** Primer paso con un problema y su mensaje: el formulario vuelve a él. */
  errors: Partial<Record<SellerStepKey, string>>
  clean: SellerValuationClean | null
}

/**
 * Valida y limpia lo que llega. Lo usan el formulario (paso a paso, para
 * decirlo antes de enviar) y el servidor (que no se fía del navegador). Lo
 * que no es una pregunta de ese tipo se descarta; un valor fuera de rango es
 * un error, no se recorta en silencio.
 */
export function validateSellerValuation(input: Partial<SellerValuationInput> | null | undefined, opts: { hiddenQuestions?: readonly string[] } = {}): SellerValidation {
  const errors: SellerValidation['errors'] = {}
  const raw = input || {}
  const type = raw.propertyType
  if (!isSellerType(type)) {
    errors.type = 'Elige el tipo de propiedad'
    return { ok: false, errors, clean: null }
  }
  const subtype = raw.subtype ? String(raw.subtype) : null
  if (subtype && !isSubtypeOf(subtype, type)) errors.type = 'Ese subtipo no corresponde a este tipo de propiedad'

  const loc = raw.location
  const label = text(loc?.label, 200)
  if (!label || label.length < 2) errors.location = 'Indica dónde está la propiedad'
  const id = typeof loc?.id === 'string' && LOCATION_ID.test(loc.id) ? loc.id : ''

  const answers: Record<string, string | number | boolean> = {}
  const given = raw.answers || {}
  for (const step of ['surface', 'features', 'extra'] as const) {
    for (const q of sellerQuestionsShown(type, step, opts.hiddenQuestions)) {
      const v = given[q.key]
      const empty = v === undefined || v === null || v === ''
      if (empty) {
        if (q.required) errors[step] = `Indica ${q.label.toLowerCase()}`
        continue
      }
      if (q.kind === 'boolean') {
        if (v === true || v === 'true') answers[q.key] = true
        else if (v === false || v === 'false') answers[q.key] = false
        else errors[step] = `Revisa «${q.label}»`
      } else if (q.kind === 'choice') {
        const ok = q.options?.some((o) => o.value === v)
        if (ok) answers[q.key] = String(v)
        else errors[step] = `Revisa «${q.label}»`
      } else {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
        const intOk = q.kind === 'integer' ? Number.isInteger(n) : true
        if (!Number.isFinite(n) || !intOk || (q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) {
          errors[step] = `Revisa «${q.label}»${q.min !== undefined && q.max !== undefined ? ` (entre ${q.min} y ${q.max})` : ''}`
        } else answers[q.key] = n
      }
    }
  }

  const photoKeys = Array.isArray(raw.photoKeys) ? raw.photoKeys.filter((k): k is string => typeof k === 'string').slice(0, SELLER_MAX_PHOTOS) : []
  const ok = Object.keys(errors).length === 0
  return {
    ok,
    errors,
    clean: ok
      ? { propertyType: type, subtype, location: { id, kind: text(loc?.kind, 20), label }, address: text(raw.address, 200) || null, answers, photoKeys }
      : null,
  }
}

/** Un valor tal como lo lee una persona («Sí», «Buen estado», «120 m²»). */
export function sellerAnswerText(q: SellerQuestion, value: string | number | boolean): string {
  if (q.kind === 'boolean') return value ? 'Sí' : 'No'
  if (q.kind === 'choice') return q.options?.find((o) => o.value === value)?.label || String(value)
  const n = Number(value)
  const num = Number.isFinite(n) ? n.toLocaleString('es-ES') : String(value)
  return q.unit ? `${num} ${q.unit}` : num
}

/**
 * El resumen legible de lo que contó la persona: es el «mensaje original» del
 * lead (el texto tal cual llegó, nunca reescrito) y lo que se lee en la
 * bandeja. Sólo contiene lo que ella respondió; no hay ninguna cifra de
 * valoración porque no hay ningún motor que la calcule.
 */
export function sellerValuationSummary(clean: SellerValuationClean, extraNote = ''): string {
  const lines: string[] = []
  const typeLabel = PROPERTY_TYPE_LABELS[clean.propertyType] || clean.propertyType
  lines.push(`Quiere vender: ${typeLabel}${clean.subtype ? ` (${propertySubtypeLabel(clean.propertyType, clean.subtype)})` : ''}`)
  lines.push(`Ubicación: ${clean.location.label}${clean.address ? ` — ${clean.address}` : ''}`)
  for (const step of ['surface', 'features', 'extra'] as const) {
    for (const q of sellerQuestions(clean.propertyType, step)) {
      const v = clean.answers[q.key]
      if (v === undefined) continue
      lines.push(`${q.label}: ${sellerAnswerText(q, v)}`)
    }
  }
  if (clean.photoKeys.length) lines.push(`Fotos adjuntas: ${clean.photoKeys.length}`)
  const note = extraNote.trim()
  if (note) lines.push('', `Comentarios: ${note}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Opciones del bloque en el Constructor
// ---------------------------------------------------------------------------

export interface SellerBlockOptions {
  /** Tipos de Property Core que NO se ofrecen. */
  hiddenTypes: string[]
  /** Preguntas opcionales que se ocultan (las obligatorias nunca). */
  hiddenQuestions: string[]
  /** Rótulos propios de preguntas (sólo texto). */
  questionLabels: Record<string, string>
  allowPhotos: boolean
}

export function normalizeSellerOptions(content: Record<string, any> | null | undefined): SellerBlockOptions {
  const c = content || {}
  const types = Array.isArray(c.hiddenTypes) ? c.hiddenTypes.filter((t: unknown) => isSellerType(t)) : []
  // Siempre queda algún tipo que ofrecer.
  const hiddenTypes = types.length >= PROPERTY_TYPES.length ? [] : [...new Set<string>(types)]
  const known = new Set<string>([...Object.values(BY_SCHEMA).flat().map((q) => q.key), ...SELLER_EXTRA_QUESTIONS.map((q) => q.key)])
  const required = new Set(Object.values(BY_SCHEMA).flat().filter((q) => q.required).map((q) => q.key))
  const hiddenQuestions = Array.isArray(c.hiddenQuestions) ? [...new Set<string>(c.hiddenQuestions.filter((k: unknown): k is string => typeof k === 'string' && known.has(k) && !required.has(k)))] : []
  const labels: Record<string, string> = {}
  if (c.questionLabels && typeof c.questionLabels === 'object') {
    for (const [k, v] of Object.entries(c.questionLabels as Record<string, unknown>)) {
      const t = text(v, 80)
      if (known.has(k) && t) labels[k] = t
    }
  }
  return { hiddenTypes, hiddenQuestions, questionLabels: labels, allowPhotos: c.allowPhotos !== false }
}

const SELLER_TEXT_FIELDS = ['eyebrow', 'title', 'description', 'submitLabel', 'successMessage', 'successDetail', 'subject', 'privacyNote'] as const

/**
 * Lo que se guarda del bloque: sus textos (acotados) y sólo las opciones que
 * difieren de las de partida y que existen de verdad en Property Core. Un
 * tipo o una pregunta inventados, una pregunta obligatoria «oculta» o un
 * rótulo vacío se descartan aquí, aunque el cliente los mande.
 */
export function compactSellerOptions(content: Record<string, any> | null | undefined): Record<string, any> {
  const c = content || {}
  const out: Record<string, any> = {}
  for (const k of SELLER_TEXT_FIELDS) if (typeof c[k] === 'string') out[k] = c[k].slice(0, k === 'successDetail' || k === 'privacyNote' || k === 'description' ? 600 : 200)
  const o = normalizeSellerOptions(c)
  if (o.hiddenTypes.length) out.hiddenTypes = o.hiddenTypes
  if (o.hiddenQuestions.length) out.hiddenQuestions = o.hiddenQuestions
  if (Object.keys(o.questionLabels).length) out.questionLabels = o.questionLabels
  if (!o.allowPhotos) out.allowPhotos = false
  return out
}

/** Todas las preguntas distintas (por clave) que puede tener el formulario: lo que el inspector deja ocultar o renombrar. */
export function sellerQuestionCatalog(): SellerQuestion[] {
  const seen = new Map<string, SellerQuestion>()
  for (const q of [...Object.values(BY_SCHEMA).flat(), ...SELLER_EXTRA_QUESTIONS]) if (!seen.has(q.key)) seen.set(q.key, q)
  return [...seen.values()]
}

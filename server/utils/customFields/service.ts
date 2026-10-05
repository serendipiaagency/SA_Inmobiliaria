import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now, slugify } from '../db'
import { assertOwnedRef, assertPropertyKind, assertPropertyOwned } from '../contacts/crm'
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_LIMITS,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPES_WITH_OPTIONS,
  formatCustomFieldValue,
  type CustomFieldDefinitionDto,
  type CustomFieldEntityType,
  type CustomFieldType,
  type CustomFieldValue,
} from '../../../utils/customFieldCatalog'

/**
 * Campos personalizados por agencia (FASE 0; tablas de la migración 0086).
 *
 * - **Definición** (`custom_field_definitions`): qué campo extra tiene una
 *   entidad de la agencia — propiedad (los dos catálogos), contacto, lead,
 *   cita u operación —, de qué tipo, en qué sección, si es obligatorio, su
 *   ayuda y si puede salir en la web pública. Se gestiona con el recurso
 *   genérico `custom-fields` (CRM → Campos personalizados); este módulo
 *   valida y normaliza lo que llega antes de guardarlo.
 * - **Valor** (`custom_field_values`): el dato de UNA entidad concreta. Se
 *   lee y se guarda con los recursos `property-custom-field-values` (área
 *   Portal Web) y `custom-field-values` (área CRM): mismo modelo, el área la
 *   pone la entidad, igual que `property-bulk-jobs` / `lead-bulk-jobs`.
 *
 * Todo va acotado por la organización: la definición, el valor y la entidad
 * a la que se cuelga. Una referencia de otra agencia responde 404, nunca 403.
 *
 * `entity_kind` lleva el catálogo en las propiedades (`agent` | `developer`)
 * y repite el tipo de entidad en el resto: así el índice único
 * (definition_id, entity_kind, entity_id) protege de verdad — con NULL, SQLite
 * no lo aplicaría.
 */

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export interface CustomFieldEntityRef {
  entityType: CustomFieldEntityType
  /** `agent` | `developer` en propiedades; el propio tipo en el resto. */
  entityKind: string
  entityId: number
}

/** Qué tipos de entidad sirve cada recurso del motor genérico (el área de permisos la decide el recurso). */
export const CUSTOM_FIELD_VALUE_RESOURCES: Record<string, readonly CustomFieldEntityType[]> = {
  'property-custom-field-values': ['property'],
  'custom-field-values': ['contact', 'lead', 'appointment', 'deal'],
}

export function isCustomFieldValueResource(key: string): boolean {
  return key in CUSTOM_FIELD_VALUE_RESOURCES
}

/** Una fila de valor leída por id desde un recurso que no le corresponde se trata como inexistente (404). */
export function assertCustomFieldValueScope(resourceKey: string, row: { entityType?: string | null }) {
  const allowed = CUSTOM_FIELD_VALUE_RESOURCES[resourceKey]
  if (allowed && !allowed.includes(row.entityType as CustomFieldEntityType)) fail(404, 'Not found')
}

function isEntityType(v: unknown): v is CustomFieldEntityType {
  return (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(String(v))
}

/** Normaliza `{ entityType, entityKind|propertyKind, entityId }` de una petición (422 si falta o no encaja). */
export function resolveEntityRef(input: Record<string, unknown>, allowed: readonly CustomFieldEntityType[] = CUSTOM_FIELD_ENTITY_TYPES): CustomFieldEntityRef {
  const entityType = String(input.entityType ?? '')
  if (!isEntityType(entityType)) fail(422, 'Tipo de entidad no válido para un campo personalizado')
  // El recurso del panel equivocado para esta entidad: se responde como si no existiera.
  if (!allowed.includes(entityType)) fail(404, 'Not found')
  const entityId = Number(input.entityId)
  if (!Number.isInteger(entityId) || entityId <= 0) fail(422, 'Falta a qué registro pertenecen los campos')
  const entityKind = entityType === 'property' ? assertPropertyKind(input.entityKind ?? input.propertyKind) : entityType
  return { entityType, entityKind, entityId }
}

/** La entidad existe y es de esta agencia — 404 en cualquier otro caso. */
export async function assertCustomFieldEntity(db: any, orgId: number, ref: CustomFieldEntityRef): Promise<void> {
  switch (ref.entityType) {
    case 'property':
      return assertPropertyOwned(db, orgId, ref.entityKind as 'agent' | 'developer', ref.entityId)
    case 'contact':
      return assertOwnedRef(db, schema.contacts, ref.entityId, orgId, 'Contacto')
    case 'lead':
      return assertOwnedRef(db, schema.leads, ref.entityId, orgId, 'Lead')
    case 'appointment':
      return assertOwnedRef(db, schema.visits, ref.entityId, orgId, 'Cita')
    case 'deal':
      return assertOwnedRef(db, schema.dealOperations, ref.entityId, orgId, 'Operación')
  }
}

function parseOptions(raw: unknown): string[] {
  if (raw == null || raw === '') return []
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      // Una lista escrita a mano, una opción por línea o separada por comas.
      list = raw.split(/[\n,]/)
    }
  }
  if (!Array.isArray(list)) return []
  return list.map((o) => String(o ?? '').trim()).filter(Boolean)
}

export function toDefinitionDto(row: any): CustomFieldDefinitionDto {
  return {
    id: row.id,
    entityType: row.entityType,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType,
    options: parseOptions(row.optionsJson),
    isRequired: Number(row.isRequired) === 1,
    section: row.section ?? null,
    sortOrder: Number(row.sortOrder) || 0,
    helpText: row.helpText ?? null,
    isPublic: Number(row.isPublic) === 1,
    status: row.status === 'archived' ? 'archived' : 'active',
  }
}

/** Las definiciones vivas de un tipo de entidad, en el orden del panel (sección, orden, alta). */
export async function listDefinitions(
  db: any,
  orgId: number,
  entityType: CustomFieldEntityType,
  opts: { includeArchived?: boolean; publicOnly?: boolean } = {},
): Promise<CustomFieldDefinitionDto[]> {
  const d = schema.customFieldDefinitions
  const conds: SQL[] = [eq(d.organizationId, orgId), eq(d.entityType, entityType), isNull(d.deletedAt)]
  if (!opts.includeArchived) conds.push(eq(d.status, 'active'))
  if (opts.publicOnly) conds.push(eq(d.isPublic, 1))
  const rows = await db.select().from(d).where(and(...conds)).orderBy(asc(d.sortOrder), asc(d.id))
  return rows.map(toDefinitionDto)
}

// --- Definiciones ---------------------------------------------------------------

/**
 * Valida y normaliza un alta o una edición de `custom-fields` (motor genérico).
 * Muta `data` (lo que se va a escribir). Reglas:
 *  - tipo de entidad y clave no cambian una vez creados (los valores cuelgan de ellos);
 *  - la clave es `a-z0-9_`, empieza por letra; si no llega, sale de la etiqueta;
 *  - las listas exigen opciones únicas; el resto no guarda opciones;
 *  - el tipo de campo sólo cambia mientras ningún registro tenga valor;
 *  - «público» sólo existe en propiedades (es lo único que sale en la web).
 */
export async function validateCustomFieldDefinition(db: any, orgId: number, data: Record<string, any>, existing: Record<string, any> | null): Promise<void> {
  const merged = { ...(existing || {}), ...data }

  if (existing && 'entityType' in data && data.entityType !== existing.entityType) fail(422, 'El tipo de entidad de un campo no se puede cambiar: crea otro campo')
  if (!isEntityType(merged.entityType)) fail(422, 'Elige a qué se aplica el campo (propiedad, contacto, lead, cita u operación)')

  if (typeof merged.label !== 'string' || !merged.label.trim()) fail(422, 'La etiqueta es obligatoria')
  if ('label' in data) data.label = String(data.label).trim()
  if (String(merged.label).trim().length > CUSTOM_FIELD_LIMITS.label) fail(422, `La etiqueta admite como máximo ${CUSTOM_FIELD_LIMITS.label} caracteres`)

  if (existing) {
    if ('key' in data && data.key != null && data.key !== existing.key) fail(422, 'La clave de un campo no se puede cambiar: los valores ya guardados dependen de ella')
    delete data.key
  } else {
    const rawKey = typeof data.key === 'string' && data.key.trim() ? data.key : String(merged.label)
    const key = slugify(rawKey).replace(/-/g, '_').slice(0, CUSTOM_FIELD_LIMITS.key)
    if (!/^[a-z][a-z0-9_]*$/.test(key)) fail(422, 'La clave debe empezar por una letra y usar sólo letras, números y guiones bajos')
    data.key = key
    // El índice único (organización, entidad, clave) es la guarda real; esto
    // sólo da un mensaje que se entiende (incluye los que están en la papelera).
    const d = schema.customFieldDefinitions
    const [clash] = await db
      .select({ id: d.id, deletedAt: d.deletedAt })
      .from(d)
      .where(and(eq(d.organizationId, orgId), eq(d.entityType, merged.entityType), eq(d.key, key)))
      .limit(1)
    if (clash) fail(409, `Ya existe un campo con la clave «${key}»${clash.deletedAt ? ' (está en la papelera: restáuralo o usa otra clave)' : ''}`)
  }

  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(String(merged.fieldType))) fail(422, 'Tipo de campo no válido')
  if (existing && 'fieldType' in data && data.fieldType !== existing.fieldType) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.customFieldValues)
      .where(and(eq(schema.customFieldValues.organizationId, orgId), eq(schema.customFieldValues.definitionId, existing.id)))
    if (Number(n) > 0) fail(422, `No se puede cambiar el tipo: ${n} registro(s) ya tienen un valor en este campo. Archívalo y crea otro.`)
  }

  const fieldType = merged.fieldType as CustomFieldType
  if (CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(fieldType)) {
    if ('optionsJson' in data || !existing || 'fieldType' in data) {
      const options = parseOptions(merged.optionsJson)
      if (!options.length) fail(422, 'Una lista necesita al menos una opción')
      if (options.length > CUSTOM_FIELD_LIMITS.options) fail(422, `Una lista admite como máximo ${CUSTOM_FIELD_LIMITS.options} opciones`)
      if (options.some((o) => o.length > CUSTOM_FIELD_LIMITS.option)) fail(422, `Cada opción admite como máximo ${CUSTOM_FIELD_LIMITS.option} caracteres`)
      const lower = options.map((o) => o.toLowerCase())
      if (new Set(lower).size !== lower.length) fail(422, 'Hay opciones repetidas')
      data.optionsJson = JSON.stringify(options)
    }
  } else if ('optionsJson' in data || 'fieldType' in data || !existing) {
    data.optionsJson = null
  }

  for (const flag of ['isRequired', 'isPublic'] as const) {
    if (flag in data) data[flag] = data[flag] === true || Number(data[flag]) === 1 || data[flag] === '1' || data[flag] === 'true' ? 1 : 0
  }
  if (Number(merged.isPublic) === 1 || merged.isPublic === true || merged.isPublic === 'true') {
    if (merged.entityType !== 'property') fail(422, 'Sólo los campos de propiedad pueden mostrarse en la web pública')
  }

  if ('section' in data) {
    data.section = typeof data.section === 'string' && data.section.trim() ? data.section.trim() : null
    if (data.section && data.section.length > CUSTOM_FIELD_LIMITS.section) fail(422, `La sección admite como máximo ${CUSTOM_FIELD_LIMITS.section} caracteres`)
  }
  if ('helpText' in data) {
    data.helpText = typeof data.helpText === 'string' && data.helpText.trim() ? data.helpText.trim() : null
    if (data.helpText && data.helpText.length > CUSTOM_FIELD_LIMITS.helpText) fail(422, `La ayuda admite como máximo ${CUSTOM_FIELD_LIMITS.helpText} caracteres`)
  }
  if ('sortOrder' in data) {
    const n = data.sortOrder == null ? 0 : Number(data.sortOrder)
    if (!Number.isInteger(n) || n < 0 || n > 100000) fail(422, 'El orden debe ser un número entero positivo')
    data.sortOrder = n
  }
  if ('status' in data && data.status != null && !['active', 'archived'].includes(data.status)) fail(422, 'Estado no válido (activo o archivado)')
}

/** Cuántos registros tienen valor en cada definición (para avisar antes de cambiarla). */
export async function countValuesByDefinition(db: any, orgId: number, definitionIds: number[]): Promise<Map<number, number>> {
  if (!definitionIds.length) return new Map()
  const v = schema.customFieldValues
  const rows = await db
    .select({ definitionId: v.definitionId, n: sql<number>`count(*)` })
    .from(v)
    // Un único parámetro JSON: una página de definiciones nunca choca con el límite de 100 parámetros de D1.
    .where(and(eq(v.organizationId, orgId), sql`${v.definitionId} in (select value from json_each(${JSON.stringify(definitionIds)}))`))
    .groupBy(v.definitionId)
  return new Map(rows.map((r: any) => [Number(r.definitionId), Number(r.n)]))
}

// --- Valores --------------------------------------------------------------------

export interface StoredCustomValue {
  valueText: string | null
  valueNumber: number | null
  valueJson: string | null
}

function isEmpty(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') || (Array.isArray(raw) && raw.length === 0)
}

function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/**
 * Valida un valor contra el tipo de su definición y lo deja listo para
 * guardar. `null` = vaciar el campo. Nunca «arregla» un valor dudoso: lo
 * rechaza con un 422 que nombra el campo.
 */
export function validateCustomFieldValue(def: Pick<CustomFieldDefinitionDto, 'label' | 'fieldType' | 'options'>, raw: unknown): StoredCustomValue | null {
  if (isEmpty(raw)) return null
  const label = def.label
  switch (def.fieldType) {
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string' && typeof raw !== 'number') fail(422, `«${label}» debe ser un texto`)
      const text = String(raw).trim()
      const max = def.fieldType === 'text' ? CUSTOM_FIELD_LIMITS.text : CUSTOM_FIELD_LIMITS.textarea
      if (text.length > max) fail(422, `«${label}» admite como máximo ${max} caracteres`)
      return { valueText: text, valueNumber: null, valueJson: null }
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(',', '.')) : Number.NaN
      if (typeof raw === 'boolean' || !Number.isFinite(n)) fail(422, `«${label}» debe ser un número`)
      return { valueText: null, valueNumber: n, valueJson: null }
    }
    case 'boolean': {
      const s = String(raw).trim().toLowerCase()
      if (raw === true || s === '1' || s === 'true' || s === 'sí' || s === 'si') return { valueText: null, valueNumber: 1, valueJson: null }
      if (raw === false || s === '0' || s === 'false' || s === 'no') return { valueText: null, valueNumber: 0, valueJson: null }
      return fail(422, `«${label}» debe ser sí o no`)
    }
    case 'date': {
      if (typeof raw !== 'string' || !isValidIsoDate(raw.trim().slice(0, 10)) || raw.trim().length > 10) fail(422, `«${label}» debe ser una fecha válida (AAAA-MM-DD)`)
      return { valueText: (raw as string).trim(), valueNumber: null, valueJson: null }
    }
    case 'select': {
      if (typeof raw !== 'string') fail(422, `«${label}» debe ser una de sus opciones`)
      const match = def.options.find((o) => o === raw.trim())
      if (!match) fail(422, `«${raw}» no es una opción de «${label}»`)
      return { valueText: match, valueNumber: null, valueJson: null }
    }
    case 'multiselect': {
      const list = Array.isArray(raw) ? raw : [raw]
      const picked: string[] = []
      for (const item of list) {
        if (typeof item !== 'string') fail(422, `«${label}» debe ser una lista de sus opciones`)
        const match = def.options.find((o) => o === item.trim())
        if (!match) fail(422, `«${item}» no es una opción de «${label}»`)
        if (!picked.includes(match)) picked.push(match)
      }
      return picked.length ? { valueText: null, valueNumber: null, valueJson: JSON.stringify(picked) } : null
    }
    default:
      return fail(422, `Tipo de campo desconocido en «${label}»`)
  }
}

/** Lo guardado, devuelto con el tipo que el panel entiende. */
export function storedToValue(fieldType: string, row: StoredCustomValue): CustomFieldValue {
  if (fieldType === 'number') return row.valueNumber
  if (fieldType === 'boolean') return row.valueNumber == null ? null : Number(row.valueNumber) === 1
  if (fieldType === 'multiselect') {
    try {
      const list = JSON.parse(row.valueJson || '[]')
      return Array.isArray(list) ? list.map(String) : []
    } catch {
      return []
    }
  }
  return row.valueText
}

async function storedValuesFor(db: any, orgId: number, ref: CustomFieldEntityRef) {
  const v = schema.customFieldValues
  return db
    .select()
    .from(v)
    .where(and(eq(v.organizationId, orgId), eq(v.entityType, ref.entityType), eq(v.entityKind, ref.entityKind), eq(v.entityId, ref.entityId)))
}

/** Definiciones activas + valores de una entidad (que primero se comprueba que es de la agencia). */
export async function loadEntityCustomFields(db: any, orgId: number, ref: CustomFieldEntityRef) {
  await assertCustomFieldEntity(db, orgId, ref)
  const definitions = await listDefinitions(db, orgId, ref.entityType)
  const stored = await storedValuesFor(db, orgId, ref)
  const byDef = new Map<number, StoredCustomValue>(stored.map((r: any) => [r.definitionId, r]))
  const values: Record<string, CustomFieldValue> = {}
  for (const d of definitions) {
    const row = byDef.get(d.id)
    values[d.key] = row ? storedToValue(d.fieldType, row) : null
  }
  return { definitions, values }
}

/**
 * Guarda los valores que llegan (`{ clave: valor }`) — sólo esos: lo que no
 * se manda no se toca. Valida cada uno por su tipo, rechaza claves que no son
 * de un campo activo de esta agencia y entidad, y comprueba los obligatorios
 * sobre el estado RESULTANTE (lo guardado + lo nuevo).
 */
export async function saveEntityCustomFields(db: any, orgId: number, userId: number | null, ref: CustomFieldEntityRef, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(422, 'Los valores deben ser un objeto { clave: valor }')
  await assertCustomFieldEntity(db, orgId, ref)
  const definitions = await listDefinitions(db, orgId, ref.entityType)
  const byKey = new Map(definitions.map((d) => [d.key, d]))

  const changes = new Map<number, StoredCustomValue | null>()
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const def = byKey.get(key)
    if (!def) fail(422, `«${key}» no es un campo personalizado activo de ${ref.entityType === 'property' ? 'las propiedades' : 'este registro'}`)
    changes.set(def.id, validateCustomFieldValue(def, raw))
  }

  const stored = await storedValuesFor(db, orgId, ref)
  const storedByDef = new Map<number, any>(stored.map((r: any) => [r.definitionId, r]))
  const missing = definitions.filter((d) => d.isRequired && (changes.has(d.id) ? changes.get(d.id) === null : !storedByDef.has(d.id)))
  if (missing.length) fail(422, `Faltan campos obligatorios: ${missing.map((d) => d.label).join(', ')}`)

  const v = schema.customFieldValues
  const ts = now()
  for (const [definitionId, value] of changes) {
    const current = storedByDef.get(definitionId)
    if (value === null) {
      if (current) await db.delete(v).where(and(eq(v.id, current.id), eq(v.organizationId, orgId)))
      continue
    }
    if (current) {
      await db
        .update(v)
        .set({ ...value, updatedBy: userId, updatedAt: ts })
        .where(and(eq(v.id, current.id), eq(v.organizationId, orgId)))
    } else {
      await db.insert(v).values({ organizationId: orgId, definitionId, entityType: ref.entityType, entityKind: ref.entityKind, entityId: ref.entityId, ...value, updatedBy: userId, createdAt: ts, updatedAt: ts })
    }
  }
  return loadEntityCustomFields(db, orgId, ref)
}

/** Al borrar definitivamente una entidad o una definición, sus valores se van con ella. */
export async function deleteCustomFieldValues(db: any, orgId: number, where: { definitionId?: number; ref?: Omit<CustomFieldEntityRef, 'entityType'> & { entityType: string } }) {
  const v = schema.customFieldValues
  const conds: SQL[] = [eq(v.organizationId, orgId)]
  if (where.definitionId) conds.push(eq(v.definitionId, where.definitionId))
  if (where.ref) conds.push(eq(v.entityType, where.ref.entityType), eq(v.entityKind, where.ref.entityKind), eq(v.entityId, where.ref.entityId))
  if (conds.length === 1) return
  await db.delete(v).where(and(...conds))
}

/**
 * Los campos marcados «público» de una propiedad, ya formateados, para la
 * web. Sólo `isPublic = 1`, activos y no borrados: un campo interno nunca
 * sale de aquí, ni vacío ni con valor.
 */
export async function publicCustomFieldsFor(db: any, orgId: number, kind: 'agent' | 'developer', propertyId: number) {
  const definitions = await listDefinitions(db, orgId, 'property', { publicOnly: true })
  if (!definitions.length) return []
  const stored = await storedValuesFor(db, orgId, { entityType: 'property', entityKind: kind, entityId: propertyId })
  const byDef = new Map<number, StoredCustomValue>(stored.map((r: any) => [r.definitionId, r]))
  const out: { key: string; label: string; section: string | null; fieldType: string; value: CustomFieldValue; display: string }[] = []
  for (const d of definitions) {
    const row = byDef.get(d.id)
    if (!row) continue
    const value = storedToValue(d.fieldType, row)
    const display = formatCustomFieldValue(d.fieldType, value)
    if (!display) continue
    out.push({ key: d.key, label: d.label, section: d.section, fieldType: d.fieldType, value, display })
  }
  return out
}

// --- Filtro de búsqueda ---------------------------------------------------------

export interface CustomFieldFilter {
  definitionId: number
  /** Coincidencia: contiene (texto), igual (lista, número, sí/no, fecha) o incluye (lista múltiple). */
  value?: string
  min?: string
  max?: string
}

/** Máximo de filtros por campo personalizado en una búsqueda: cada uno es una subconsulta. */
export const MAX_CUSTOM_FIELD_FILTERS = 10

/**
 * Lee `cf_<id>`, `cf_<id>_min` y `cf_<id>_max` de una query string. El id de
 * la definición viene del cliente, pero la subconsulta exige que la
 * definición sea de la MISMA organización que la propiedad: una ajena no
 * coincide con nada.
 */
export function parseCustomFieldFilters(query: Record<string, unknown>): CustomFieldFilter[] {
  const byId = new Map<number, CustomFieldFilter>()
  for (const [k, raw] of Object.entries(query)) {
    const m = /^cf_(\d+)(_min|_max)?$/.exec(k)
    if (!m || raw == null || String(raw).trim() === '') continue
    const definitionId = Number(m[1])
    if (!Number.isInteger(definitionId) || definitionId <= 0) continue
    const f = byId.get(definitionId) || { definitionId }
    const value = String(raw).trim().slice(0, 200)
    if (m[2] === '_min') f.min = value
    else if (m[2] === '_max') f.max = value
    else f.value = value
    byId.set(definitionId, f)
  }
  const list = [...byId.values()]
  if (list.length > MAX_CUSTOM_FIELD_FILTERS) fail(422, `Como máximo ${MAX_CUSTOM_FIELD_FILTERS} filtros por campo personalizado a la vez`)
  return list
}

function boolParam(v: string): number | null {
  const s = v.toLowerCase()
  if (['1', 'true', 'sí', 'si', 'yes'].includes(s)) return 1
  if (['0', 'false', 'no'].includes(s)) return 0
  return null
}

/**
 * Una subconsulta por filtro, correlacionada con la propiedad (id, catálogo
 * y organización). La comparación depende del tipo de la definición, que se
 * resuelve en SQL con el JOIN — así el constructor sigue siendo síncrono,
 * como el resto de `buildPropertyFilterConds()`.
 */
export function customFieldFilterConds(kind: 'agent' | 'developer', t: any, filters: CustomFieldFilter[]): SQL[] {
  return filters.map((f) => {
    const parts: SQL[] = []
    if (f.value !== undefined) {
      const num = Number(f.value.replace(',', '.'))
      const numParam = Number.isFinite(num) ? num : null
      parts.push(sql`(case d.field_type
        when 'text' then v.value_text like ${`%${f.value}%`}
        when 'textarea' then v.value_text like ${`%${f.value}%`}
        when 'multiselect' then exists (select 1 from json_each(v.value_json) j where j.value = ${f.value})
        when 'number' then v.value_number = ${numParam}
        when 'boolean' then v.value_number = ${boolParam(f.value)}
        else v.value_text = ${f.value} end)`)
    }
    if (f.min !== undefined) {
      const n = Number(f.min.replace(',', '.'))
      parts.push(sql`(case d.field_type when 'number' then v.value_number >= ${Number.isFinite(n) ? n : null} when 'date' then v.value_text >= ${f.min} else 0 end)`)
    }
    if (f.max !== undefined) {
      const n = Number(f.max.replace(',', '.'))
      parts.push(sql`(case d.field_type when 'number' then v.value_number <= ${Number.isFinite(n) ? n : null} when 'date' then v.value_text <= ${f.max} else 0 end)`)
    }
    return sql`exists (select 1 from custom_field_values v
      join custom_field_definitions d on d.id = v.definition_id and d.organization_id = v.organization_id
      where v.organization_id = ${t.organizationId}
        and v.entity_type = 'property' and v.entity_kind = ${kind} and v.entity_id = ${t.id}
        and v.definition_id = ${f.definitionId}
        and d.entity_type = 'property' and d.deleted_at is null
        and ${sql.join(parts.length ? parts : [sql`1`], sql` and `)})`
  })
}

// --- Recursos del motor genérico -----------------------------------------------

/**
 * GET de `property-custom-field-values` / `custom-field-values`:
 *  - con `entityType` + `entityId` (+ `entityKind` en propiedades): las
 *    definiciones activas y los valores de ESE registro (404 si no es de la agencia);
 *  - sin `entityId`: sólo las definiciones activas del tipo (para filtros).
 */
export async function customFieldValuesResourceGet(db: any, orgId: number, resourceKey: string, query: Record<string, unknown>) {
  const allowed = CUSTOM_FIELD_VALUE_RESOURCES[resourceKey]!
  if (query.entityId == null || query.entityId === '') {
    const entityType = query.entityType ? String(query.entityType) : allowed[0]
    if (!isEntityType(entityType)) fail(422, 'Tipo de entidad no válido para un campo personalizado')
    if (!allowed.includes(entityType)) fail(404, 'Not found')
    return { definitions: await listDefinitions(db, orgId, entityType) }
  }
  return loadEntityCustomFields(db, orgId, resolveEntityRef(query, allowed))
}

/** POST de esos mismos recursos: `{ entityType, entityKind?, entityId, values: { clave: valor } }`. */
export async function customFieldValuesResourcePost(db: any, orgId: number, userId: number | null, resourceKey: string, body: Record<string, unknown>) {
  const allowed = CUSTOM_FIELD_VALUE_RESOURCES[resourceKey]!
  const ref = resolveEntityRef(body, allowed)
  const saved = await saveEntityCustomFields(db, orgId, userId, ref, body.values)
  return { ok: true, ...saved, ref }
}

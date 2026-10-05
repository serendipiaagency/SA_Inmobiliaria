import { and, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { selectInChunks } from '../sqlChunks'
import { assertOwnedReference } from '../tenantPolicy'
import { PROPERTY_SHEET_FIELDS, PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type SheetField } from '../../../utils/propertySheet'

/**
 * Ficha ampliada de la propiedad (migración 0086): lectura, validación y
 * guardado de los campos de `utils/propertySheet.ts` en sus dos tablas 1:1
 * (`property_details`, `property_legal_economics`).
 *
 * Quien llama ya ha autorizado la propiedad para la organización
 * (`authorizeRecord` en el CRUD genérico); aun así cada escritura lleva la
 * organización en el WHERE, para que un fallo de cableado no pueda tocar la
 * fila de otra agencia.
 */

export type PropertyKind = 'agent' | 'developer'

export function propertyKindForResource(key: string): PropertyKind | null {
  if (key === 'properties') return 'agent'
  if (key === 'developer-properties') return 'developer'
  return null
}

export interface SheetPayload {
  details: Record<string, unknown>
  legal: Record<string, unknown>
}

const TEXT_MAX = 4000

function invalid(field: SheetField, why: string): never {
  throw createError({ statusCode: 422, statusMessage: `${field.label}: ${why}` })
}

function coerce(field: SheetField, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return null
  switch (field.type) {
    case 'number':
    case 'integer': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
      if (!Number.isFinite(n)) invalid(field, 'debe ser un número')
      if (field.type === 'integer' && !Number.isInteger(n)) invalid(field, 'debe ser un número entero')
      if (field.min != null && n < field.min) invalid(field, `no puede ser menor que ${field.min}`)
      if (field.max != null && n > field.max) invalid(field, `no puede ser mayor que ${field.max}`)
      return n
    }
    case 'bool': {
      if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1
      if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 0
      return invalid(field, 'debe ser sí o no')
    }
    case 'select': {
      const v = String(raw)
      // El subtipo depende del tipo: lo comprueba assertSubtypeMatchesType().
      if (field.key !== 'subtype' && !field.options?.includes(v)) invalid(field, 'valor no permitido')
      return v
    }
    case 'relation': {
      const n = Number(raw)
      if (!Number.isInteger(n) || n <= 0) invalid(field, 'identificador inválido')
      return n
    }
    case 'date': {
      const v = String(raw).slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) invalid(field, 'fecha inválida (AAAA-MM-DD)')
      return v
    }
    case 'url': {
      const v = String(raw).trim()
      if (!/^https?:\/\/\S+$/i.test(v)) invalid(field, 'debe ser un enlace que empiece por https://')
      if (v.length > 1000) invalid(field, 'el enlace es demasiado largo')
      return v
    }
    default: {
      const v = String(raw).trim()
      if (v.length > TEXT_MAX) invalid(field, `máximo ${TEXT_MAX} caracteres`)
      return v || null
    }
  }
}

/** Separa del cuerpo de la petición los campos de la ficha ampliada que trae (sólo los presentes: ausente = no se toca). */
export function extractSheetPayload(body: Record<string, unknown>): SheetPayload {
  const out: SheetPayload = { details: {}, legal: {} }
  for (const field of PROPERTY_SHEET_FIELDS) {
    if (!(field.key in body)) continue
    const value = coerce(field, body[field.key])
    if (field.store === 'details') out.details[field.key] = value
    else out.legal[field.key] = value
  }
  if (out.details.commercialCode != null && String(out.details.commercialCode).length > 60) {
    throw createError({ statusCode: 422, statusMessage: 'Código comercial: máximo 60 caracteres' })
  }
  return out
}

export function hasSheetChanges(payload: SheetPayload): boolean {
  return Object.keys(payload.details).length > 0 || Object.keys(payload.legal).length > 0
}

/** El tipo de inmueble tiene que ser uno de la lista común (utils/propertySheet.ts). */
export function assertValidPropertyType(propertyType: unknown): void {
  if (propertyType === null || propertyType === undefined || propertyType === '') return
  if (!(PROPERTY_TYPES as readonly string[]).includes(String(propertyType))) {
    throw createError({
      statusCode: 422,
      statusMessage: `Tipo de inmueble no válido. Usa uno de: ${PROPERTY_TYPES.map((t) => PROPERTY_TYPE_LABELS[t]).join(', ')}.`,
    })
  }
}

/** Un subtipo sólo vale para su tipo («Ático dúplex» no es un subtipo de «Local»). */
export function assertSubtypeMatchesType(subtype: unknown, propertyType: unknown): void {
  if (subtype === null || subtype === undefined || subtype === '') return
  const allowed = propertyType ? PROPERTY_SUBTYPES[String(propertyType)] : undefined
  if (!allowed) throw createError({ statusCode: 422, statusMessage: 'Subtipo: elige primero el tipo de inmueble' })
  if (!(String(subtype) in allowed)) {
    throw createError({ statusCode: 422, statusMessage: `Subtipo no válido para ${PROPERTY_TYPE_LABELS[String(propertyType)] || propertyType}` })
  }
}

/** La oficina y el equipo tienen que ser de la misma organización (nunca basta con un id). */
export async function assertSheetReferences(db: any, payload: SheetPayload, orgId: number): Promise<void> {
  if (payload.details.officeId != null) await assertOwnedReference(db, { table: schema.offices, id: payload.details.officeId, orgId, label: 'Oficina' })
  if (payload.details.teamId != null) await assertOwnedReference(db, { table: schema.teams, id: payload.details.teamId, orgId, label: 'Equipo' })
}

const DETAIL_KEYS = PROPERTY_SHEET_FIELDS.filter((f) => f.store === 'details').map((f) => f.key)
const LEGAL_KEYS = PROPERTY_SHEET_FIELDS.filter((f) => f.store === 'legal').map((f) => f.key)

function pick(row: Record<string, any> | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = row?.[k] ?? null
  return out
}

/** Todos los campos de la ficha ampliada de una propiedad, planos (null si no se han rellenado). */
export async function loadPropertySheet(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<Record<string, unknown>> {
  const [details] = await db
    .select()
    .from(schema.propertyDetails)
    .where(and(eq(schema.propertyDetails.organizationId, orgId), eq(schema.propertyDetails.propertyKind, kind), eq(schema.propertyDetails.propertyId, propertyId)))
    .limit(1)
  const [legal] = await db
    .select()
    .from(schema.propertyLegalEconomics)
    .where(
      and(
        eq(schema.propertyLegalEconomics.organizationId, orgId),
        eq(schema.propertyLegalEconomics.propertyKind, kind),
        eq(schema.propertyLegalEconomics.propertyId, propertyId),
      ),
    )
    .limit(1)
  return { ...pick(details, DETAIL_KEYS), ...pick(legal, LEGAL_KEYS) }
}

/** Ficha ampliada de varias propiedades de un mismo catálogo a la vez (listados, exportación, búsqueda). */
export async function loadPropertySheets(db: any, orgId: number, kind: PropertyKind, propertyIds: number[]): Promise<Map<number, Record<string, unknown>>> {
  const out = new Map<number, Record<string, unknown>>()
  if (!propertyIds.length) return out
  const ids = [...new Set(propertyIds)]
  const detailRows = await selectInChunks(ids, (part) =>
    db
      .select()
      .from(schema.propertyDetails)
      .where(and(eq(schema.propertyDetails.organizationId, orgId), eq(schema.propertyDetails.propertyKind, kind), inArray(schema.propertyDetails.propertyId, part))),
  )
  const legalRows = await selectInChunks(ids, (part) =>
    db
      .select()
      .from(schema.propertyLegalEconomics)
      .where(
        and(
          eq(schema.propertyLegalEconomics.organizationId, orgId),
          eq(schema.propertyLegalEconomics.propertyKind, kind),
          inArray(schema.propertyLegalEconomics.propertyId, part),
        ),
      ),
  )
  const byDetails = new Map<number, any>(detailRows.map((r: any) => [r.propertyId, r]))
  const byLegal = new Map<number, any>(legalRows.map((r: any) => [r.propertyId, r]))
  for (const id of ids) out.set(id, { ...pick(byDetails.get(id), DETAIL_KEYS), ...pick(byLegal.get(id), LEGAL_KEYS) })
  return out
}

async function upsert(db: any, table: any, orgId: number, kind: PropertyKind, propertyId: number, values: Record<string, unknown>, userId: number | null): Promise<void> {
  if (!Object.keys(values).length) return
  const ts = now()
  const where = and(eq(table.organizationId, orgId), eq(table.propertyKind, kind), eq(table.propertyId, propertyId))
  const [existing] = await db.select({ id: table.id }).from(table).where(where).limit(1)
  if (existing) {
    await db
      .update(table)
      .set({ ...values, updatedBy: userId, updatedAt: ts })
      .where(and(eq(table.id, existing.id), eq(table.organizationId, orgId)))
    return
  }
  await db.insert(table).values({ organizationId: orgId, propertyKind: kind, propertyId, ...values, createdBy: userId, updatedBy: userId, createdAt: ts, updatedAt: ts })
}

/** Guarda lo que trae el payload (sólo esas columnas) creando la fila 1:1 la primera vez. */
export async function savePropertySheet(db: any, orgId: number, kind: PropertyKind, propertyId: number, payload: SheetPayload, userId: number | null): Promise<void> {
  await upsert(db, schema.propertyDetails, orgId, kind, propertyId, payload.details, userId)
  await upsert(db, schema.propertyLegalEconomics, orgId, kind, propertyId, payload.legal, userId)
}

/** Al borrar de verdad una propiedad (desde la Papelera), su ficha ampliada se va con ella. */
export async function deletePropertySheet(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<void> {
  for (const table of [schema.propertyDetails, schema.propertyLegalEconomics]) {
    await db.delete(table).where(and(eq(table.organizationId, orgId), eq(table.propertyKind, kind), eq(table.propertyId, propertyId)))
  }
}

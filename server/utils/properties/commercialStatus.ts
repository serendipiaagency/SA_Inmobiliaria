import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { savePropertySheet, type PropertyKind, type SheetPayload } from './extendedSheet'
import { commercialStatusForAvailability, isCommercialStatus, rowChangesForCommercialStatus } from '../../../utils/propertyCommercialStatus'
import { PROPERTY_DATE_FIELDS, PROPERTY_DATE_FIELD_LABELS, isStrictIsoDate, parsePropertyDate } from '../../../utils/propertyDates'

/**
 * Cierre D1p — las reglas de la ficha que se aplican al guardar una
 * propiedad, compartidas por el PUT y el POST del motor genérico
 * (`[resource]/[id].put.ts`, `index.post.ts`), las acciones masivas y el
 * cierre de una operación:
 *
 * - las fechas de gestión (captación e inicio/vencimiento de la exclusiva) en
 *   `AAAA-MM-DD`, exigido sólo AL CAMBIARLAS: una ficha antigua con
 *   «15/03/2025» se sigue guardando sin tocarla;
 * - la convivencia del estado comercial común con la casilla «Reservada» y
 *   con la disponibilidad de 2ª mano (reglas en utils/propertyCommercialStatus.ts).
 *
 * Quien llama ya autorizó la propiedad para la organización; aun así toda
 * lectura y escritura lleva la organización en el WHERE.
 */

/** El estado comercial guardado de una propiedad (`null` si no tiene ficha ampliada o está vacío). */
export async function loadCommercialStatus(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<string | null> {
  const D = schema.propertyDetails
  const [row] = await db
    .select({ commercialStatus: D.commercialStatus })
    .from(D)
    .where(and(eq(D.organizationId, orgId), eq(D.propertyKind, kind), eq(D.propertyId, propertyId)))
    .limit(1)
  return row?.commercialStatus || null
}

/**
 * 422 si una fecha de gestión que CAMBIA no es `AAAA-MM-DD` de calendario, o
 * si el vencimiento de la exclusiva queda antes de su inicio. `existing` es la
 * fila guardada (null al crear: entonces todo lo que llega es un cambio).
 */
export function assertPropertyDatesOnSave(data: Record<string, any>, existing: Record<string, any> | null): void {
  const changed = (key: string) => key in data && (!existing || (data[key] ?? null) !== (existing[key] ?? null))
  for (const key of PROPERTY_DATE_FIELDS) {
    if (!changed(key) || data[key] === null) continue
    if (!isStrictIsoDate(data[key])) {
      throw createError({ statusCode: 422, statusMessage: `${PROPERTY_DATE_FIELD_LABELS[key]}: fecha no válida, usa AAAA-MM-DD (por ejemplo 2026-03-15).` })
    }
  }
  if (changed('exclusiveFrom') || changed('exclusiveUntil')) {
    const pick = (key: string) => parsePropertyDate(key in data ? data[key] : existing?.[key])
    const from = pick('exclusiveFrom')
    const until = pick('exclusiveUntil')
    if (from && until && until < from) throw createError({ statusCode: 422, statusMessage: 'Exclusividad: el vencimiento no puede ser anterior al inicio.' })
  }
}

/**
 * Aplica, sobre lo que se va a guardar (`data` de la fila y `sheet` de la
 * ficha ampliada), las reglas del estado comercial. Sólo actúa si el estado
 * comercial o —en 2ª mano— la disponibilidad CAMBIAN respecto de lo guardado;
 * guardar la ficha sin tocarlos no reescribe nada.
 */
export async function applyCommercialStatusRulesOnSave(
  db: any,
  orgId: number,
  kind: PropertyKind,
  propertyId: number | null,
  data: Record<string, any>,
  sheet: SheetPayload,
  existing: Record<string, any> | null,
): Promise<void> {
  const inBody = 'commercialStatus' in sheet.details
  const availabilityChanged = kind === 'agent' && 'status' in data && data.status !== (existing?.status ?? null)
  if (!inBody && !availabilityChanged) return
  const current = propertyId ? await loadCommercialStatus(db, orgId, kind, propertyId) : null
  const next = inBody ? ((sheet.details.commercialStatus as string | null) ?? null) : current
  if (inBody && next !== current) {
    Object.assign(data, rowChangesForCommercialStatus(kind, next))
    return
  }
  if (availabilityChanged) {
    const derived = commercialStatusForAvailability(data.status, current)
    if (derived !== undefined) {
      sheet.details.commercialStatus = derived
      data.isReserved = rowChangesForCommercialStatus(kind, derived).isReserved
    }
  }
}

/**
 * Cambia el estado comercial de una propiedad ya autorizada (acción masiva
 * «Cambiar estado comercial»): la ficha ampliada y, con las mismas reglas que
 * el PUT, la casilla «Reservada» y —en 2ª mano— la disponibilidad.
 */
export async function setPropertyCommercialStatus(db: any, orgId: number, kind: PropertyKind, property: Record<string, any>, next: string, userId: number | null): Promise<void> {
  if (!isCommercialStatus(next)) throw createError({ statusCode: 422, statusMessage: `Estado comercial no válido: ${String(next).slice(0, 40)}` })
  const current = await loadCommercialStatus(db, orgId, kind, Number(property.id))
  if (current === next) return
  const t = (kind === 'agent' ? schema.agentProperties : schema.developerProperties) as any
  await savePropertySheet(db, orgId, kind, Number(property.id), { details: { commercialStatus: next }, legal: {} }, userId)
  await db
    .update(t)
    .set({ ...rowChangesForCommercialStatus(kind, next), updatedAt: now() })
    .where(and(eq(t.id, Number(property.id)), eq(t.organizationId, orgId)))
}

/**
 * Regla 3 fuera del PUT (acción masiva «Cambiar disponibilidad», cierre de
 * una operación): tras cambiar la disponibilidad de una propiedad de 2ª mano,
 * el estado comercial indicado que la contradice se ajusta.
 */
export async function syncCommercialStatusAfterAvailability(db: any, orgId: number, propertyId: number, nextStatus: string, userId: number | null): Promise<void> {
  const current = await loadCommercialStatus(db, orgId, 'agent', propertyId)
  const derived = commercialStatusForAvailability(nextStatus, current)
  if (derived === undefined) return
  await savePropertySheet(db, orgId, 'agent', propertyId, { details: { commercialStatus: derived }, legal: {} }, userId)
  await db
    .update(schema.agentProperties)
    .set({ isReserved: rowChangesForCommercialStatus('agent', derived).isReserved })
    .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
}

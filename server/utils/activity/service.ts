import { and, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import type { PropertyKind } from '../matching/service'

/**
 * ActivityService (FASE 21) — el único sitio que escribe en `activities`.
 * Ningún endpoint ni componente debe insertar ahí directamente: así todo
 * evento tiene la misma forma, y "qué eventos existen de verdad" se puede
 * responder leyendo `ACTIVITY_EVENT_TYPES` en vez de grepeando el código.
 *
 * Sólo se registran eventos con un disparador real ya existente en este
 * repositorio — nunca se inventa uno para completar la lista del megaprompt
 * (sección 32: "no es necesario implementar eventos que todavía no ocurren
 * realmente"). Notablemente ausente: LEAD_CONTACTED (no hay una acción
 * distinta de las que ya cubre `messages`/`calls` en la cronología de
 * Cliente).
 *
 * PROPERTY_SENT y CALL_COMPLETED (FASE 29 §128) sí tienen ya un disparador
 * real: `server/utils/comms/inbox.ts#sendOutbound` (cuando `storeAs ===
 * 'property_share'` y el envío se aceptó) y
 * `server/utils/comms/calls.ts#ingestCallEvent`/`logManualCall` (cuando la
 * llamada termina con evidencia real de que se contestó). Ninguno de los
 * dos vuelca el cuerpo del mensaje ni notas en `metadata` — sólo referencia
 * a la fila real (`entityType`/`entityId`), que es la fuente de verdad.
 *
 * Bloque N6 (FASES 21-24):
 *  - PROPERTY_SHARE_OPENED — «el cliente abrió la ficha»: la ÚNICA señal real
 *    que existe es la confirmación de lectura de WhatsApp de una ficha que
 *    se le envió (`comms/inbox.ts#applyMessageStatus`, la primera vez que un
 *    `property_share` pasa a `read`; la misma señal que usa el Lead Score).
 *    La web pública no asocia sus visitas a un contacto, así que no se
 *    registra nada por ahí.
 *  - «Match encontrado» automático NO se registra: el motor de matching
 *    calcula las compatibilidades al vuelo y sólo persiste una fila cuando
 *    una persona decide (seleccionar/descartar/enviar). No hay ningún
 *    momento real en el que «se encuentre» un match que se pueda fechar.
 *  - OFFER_RESUBMITTED (nueva oferta del comprador tras una contraoferta),
 *    TASK_CANCELLED y DEAL_RECORD_LINKED/UNLINKED (reserva, arras o
 *    contrato vinculados a una operación) salen de acciones reales de sus
 *    servicios.
 */

export const ACTIVITY_EVENT_TYPES = [
  'LEAD_CREATED',
  'LEAD_ASSIGNED',
  'LEAD_REASSIGNED',
  'LEAD_QUALIFIED',
  'BUYER_REQUIREMENT_CREATED',
  'MATCH_SELECTED',
  'MATCH_DISCARDED',
  // Núcleo N4: «Crear selección» desde una compatibilidad (server/utils/matching/actions.ts).
  'PROPERTY_SELECTION_CREATED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
  'VIEWING_COMPLETED',
  'VIEWING_NO_SHOW',
  'VISIT_OUTCOME_RECORDED',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'OFFER_CREATED',
  'OFFER_SUBMITTED',
  'OFFER_COUNTERED',
  'OFFER_RESUBMITTED',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'OFFER_WITHDRAWN',
  'OFFER_EXPIRED',
  'DEAL_CREATED',
  'DEAL_STAGE_CHANGED',
  'DEAL_CLOSED',
  'DEAL_CANCELLED',
  'DEAL_RECORD_LINKED',
  'DEAL_RECORD_UNLINKED',
  'PROPERTY_SENT',
  'PROPERTY_SHARE_OPENED',
  'CALL_COMPLETED',
] as const
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number]

export const ACTIVITY_ACTOR_TYPES = ['user', 'contact', 'system', 'ai'] as const
export type ActivityActorType = (typeof ACTIVITY_ACTOR_TYPES)[number]

export interface RecordActivityInput {
  eventType: ActivityEventType
  /** La entidad que originó el evento — normalmente coincide con una de las relaciones de abajo, pero no siempre (p.ej. un MATCH_SELECTED lo origina el match, no el lead ni el inmueble). */
  entityType: string
  entityId: number
  contactId?: number | null
  leadId?: number | null
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  appointmentId?: number | null
  buyerRequirementId?: number | null
  actorType: ActivityActorType
  actorId?: number | null
  metadata?: Record<string, unknown> | null
}

/** Registra un hecho comercial. Nunca lanza — un fallo aquí no debe deshacer la acción real que lo originó (mismo criterio que `logAdminAction`/`notifyAppointment`). */
export async function recordActivity(db: any, orgId: number, input: RecordActivityInput): Promise<void> {
  try {
    await db.insert(schema.activities).values({
      organizationId: orgId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      propertyId: input.propertyId ?? null,
      propertyKind: input.propertyKind ?? null,
      appointmentId: input.appointmentId ?? null,
      buyerRequirementId: input.buyerRequirementId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now(),
    })
  } catch {
    // Ver comentario de arriba: el hecho ya ocurrió de verdad aunque no se pueda dejar constancia.
  }
}

export interface ActivityRow {
  id: number
  eventType: string
  entityType: string
  entityId: number
  contactId: number | null
  leadId: number | null
  propertyId: number | null
  propertyKind: string | null
  appointmentId: number | null
  buyerRequirementId: number | null
  actorType: string
  actorId: number | null
  metadataJson: string | null
  createdAt: string
}

export interface ListActivityFilter {
  contactId?: number
  leadId?: number
  propertyId?: number
  propertyKind?: PropertyKind
  appointmentId?: number
  /**
   * La cronología de una operación (deal_operations): sus propios eventos,
   * los de la oferta que la originó, los de sus tareas y los de sus citas.
   * `activities` no tiene columna de operación (y no se añade ninguna), así
   * que se reconstruye a partir de las relaciones reales de la operación.
   */
  dealId?: number
  /** Sólo estos tipos de evento (filtro de la cronología). */
  eventTypes?: string[]
}

/**
 * Condición «actividad de esta operación». La operación se lee acotada a la
 * organización: una de otra agencia (o borrada) no devuelve nada — nunca la
 * cronología de otro.
 */
async function dealActivityCond(db: any, orgId: number, dealId: number): Promise<SQL | null> {
  const [deal] = await db
    .select({ id: schema.dealOperations.id, acceptedOfferId: schema.dealOperations.acceptedOfferId })
    .from(schema.dealOperations)
    .where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId), isNull(schema.dealOperations.deletedAt)))
    .limit(1)
  if (!deal) return null
  // Subconsultas, no listas de ids: una operación con muchas tareas o citas
  // no puede hacer crecer el número de parámetros (D1 admite 100 por consulta).
  const dealTaskIds = db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.organizationId, orgId), eq(schema.tasks.dealId, dealId)))
  const dealVisitIds = db.select({ id: schema.visits.id }).from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.dealId, dealId)))
  return or(
    and(eq(schema.activities.entityType, 'deal'), eq(schema.activities.entityId, deal.id)),
    and(eq(schema.activities.entityType, 'offer'), eq(schema.activities.entityId, deal.acceptedOfferId)),
    and(eq(schema.activities.entityType, 'task'), inArray(schema.activities.entityId, dealTaskIds)),
    inArray(schema.activities.appointmentId, dealVisitIds),
  ) as SQL
}

/**
 * Lista la actividad de una entidad, más reciente primero, paginada por
 * cursor (id — monótono con el orden de inserción, más barato que un OFFSET
 * sobre una tabla que crece sin límite). Exige exactamente un filtro: una
 * consulta sin ninguno leería la actividad de toda la organización de golpe.
 */
export async function listActivity(db: any, orgId: number, filter: ListActivityFilter, opts: { before?: number; limit?: number } = {}): Promise<{ rows: ActivityRow[]; nextBefore: number | null }> {
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 100))
  const conditions = [eq(schema.activities.organizationId, orgId)]
  if (filter.contactId) conditions.push(eq(schema.activities.contactId, filter.contactId))
  if (filter.leadId) conditions.push(eq(schema.activities.leadId, filter.leadId))
  if (filter.propertyId) {
    conditions.push(eq(schema.activities.propertyId, filter.propertyId))
    if (filter.propertyKind) conditions.push(eq(schema.activities.propertyKind, filter.propertyKind))
  }
  if (filter.appointmentId) conditions.push(eq(schema.activities.appointmentId, filter.appointmentId))
  if (filter.dealId) {
    const cond = await dealActivityCond(db, orgId, filter.dealId)
    if (!cond) return { rows: [], nextBefore: null }
    conditions.push(cond)
  }
  if (conditions.length === 1) throw new Error('listActivity requiere al menos un filtro de entidad')
  if (filter.eventTypes?.length) conditions.push(inArray(schema.activities.eventType, filter.eventTypes))
  if (opts.before) conditions.push(lt(schema.activities.id, opts.before))

  const rows = await db
    .select()
    .from(schema.activities)
    .where(and(...conditions))
    .orderBy(desc(schema.activities.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const nextBefore = rows.length > limit ? page[page.length - 1].id : null
  return { rows: page, nextBefore }
}

import { and, desc, eq, lt } from 'drizzle-orm'
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
 * realmente"). Notablemente ausentes: PROPERTY_SENT (no hay envío
 * rastreable todavía), LEAD_CONTACTED (no hay una acción distinta de las que
 * ya cubre `messages`/`calls` en la cronología de Cliente), y todo lo de
 * Offer/Deal (FASE 23-24, no implementadas aún).
 */

export const ACTIVITY_EVENT_TYPES = [
  'LEAD_CREATED',
  'LEAD_ASSIGNED',
  'LEAD_REASSIGNED',
  'LEAD_QUALIFIED',
  'BUYER_REQUIREMENT_CREATED',
  'MATCH_SELECTED',
  'MATCH_DISCARDED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
  'VIEWING_COMPLETED',
  'VIEWING_NO_SHOW',
  'VISIT_OUTCOME_RECORDED',
  'TASK_CREATED',
  'TASK_COMPLETED',
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
  if (conditions.length === 1) throw new Error('listActivity requiere al menos un filtro de entidad')
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

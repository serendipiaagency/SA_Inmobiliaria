import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, isUniqueConstraintError } from '../db'
import { hasOverlappingVisit, shiftDateTime } from './availability'
import { notifyAppointment } from './notifications'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'

/**
 * Cambiar una cita existente — confirmar, cancelar, marcar realizada o no
 * presentada, reprogramar, reasignar, reclasificar o cambiar la duración —
 * con la comprobación real de solapes, Activity, próxima acción del lead y
 * aviso al cliente. Antes vivía dentro de la ruta del panel
 * (`saas/visits/[id].patch.ts`); se extrae aquí (FASE 31) para que las
 * Domain Tools (`reschedule_viewing`, `cancel_viewing`) usen exactamente las
 * mismas reglas en vez de una copia. La identidad y el historial de la cita
 * se conservan: reprogramar mueve la misma fila, cancelar cambia el estado
 * (nunca se borra).
 */
const VALID_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
const VALID_TYPES = ['property_viewing', 'call', 'notary', 'other'] as const
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export interface UpdateAppointmentInput {
  status?: string
  scheduledAt?: string
  agentId?: number | null
  /** FASE 17, migración 0072: reclasificar una cita mal etiquetada. */
  type?: string
  /** FASE 20: "resize" en Calendar — cambiar la duración sin mover la hora de inicio ni el comercial. */
  durationMinutes?: number
}

export interface UpdateAppointmentContext {
  userId: number | null
  actorType?: 'user' | 'ai'
  env: Record<string, any>
  requestId?: string | null
  publicOrigin?: string | null
}

export async function updateAppointment(db: any, orgId: number, visitId: number, body: UpdateAppointmentInput, ctx: UpdateAppointmentContext) {
  if (!Number.isFinite(visitId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const rows = await db.select().from(schema.visits).where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId))).limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })

  const patch: Record<string, any> = {}

  if (body?.status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(body.status)) throw createError({ statusCode: 422, statusMessage: 'Estado inválido' })
    patch.status = body.status
  }

  if (body?.type !== undefined) {
    if (!(VALID_TYPES as readonly string[]).includes(body.type)) throw createError({ statusCode: 422, statusMessage: 'Tipo inválido' })
    patch.type = body.type
  }

  const nextAgentId = body?.agentId !== undefined ? body.agentId : visit.agentId
  const nextScheduledAt = body?.scheduledAt !== undefined ? body.scheduledAt : visit.scheduledAt
  const durationChanged = body?.durationMinutes !== undefined && body.durationMinutes !== visit.durationMinutes
  const agentOrTimeChanged = (body?.agentId !== undefined && body.agentId !== visit.agentId) || (body?.scheduledAt !== undefined && body.scheduledAt !== visit.scheduledAt)

  if (durationChanged && (!Number.isInteger(body!.durationMinutes) || body!.durationMinutes! < 5 || body!.durationMinutes! > 480)) {
    throw createError({ statusCode: 422, statusMessage: 'durationMinutes debe ser un entero entre 5 y 480' })
  }

  if (agentOrTimeChanged || durationChanged) {
    if (!nextScheduledAt || !DATETIME_RE.test(nextScheduledAt)) throw createError({ statusCode: 422, statusMessage: 'scheduledAt inválido' })
    if (nextAgentId) {
      let durationMinutes = durationChanged ? body!.durationMinutes! : visit.durationMinutes
      if (body?.agentId !== undefined && body.agentId !== visit.agentId) {
        const agentRows = await db
          .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
          .from(schema.teamMembers)
          .where(and(eq(schema.teamMembers.id, nextAgentId), eq(schema.teamMembers.organizationId, orgId)))
          .limit(1)
        if (!agentRows[0]) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })
        // Cambiar de comercial reasigna a su duración por defecto, salvo que este mismo PATCH también fije una duración explícita ("resize" combinado con reasignar).
        durationMinutes = durationChanged ? body!.durationMinutes! : agentRows[0].slotDurationMinutes
        patch.agentId = agentRows[0].id
        patch.agentName = agentRows[0].name
      }
      const endsAt = shiftDateTime(nextScheduledAt, durationMinutes)
      const conflict = await hasOverlappingVisit(db, orgId, nextAgentId, nextScheduledAt, endsAt, visitId)
      if (conflict) throw createError({ statusCode: 409, statusMessage: 'Ese agente ya tiene otra cita en ese horario.' })
      patch.scheduledAt = nextScheduledAt
      patch.durationMinutes = durationMinutes
      patch.endsAt = endsAt
    } else {
      patch.scheduledAt = nextScheduledAt
    }
    // Un cambio de hora, de duración o de comercial invalida la confirmación
    // que el cliente ya hubiera dado — igual que se resetean los recordatorios al reprogramar.
    if (visit.confirmationStatus === 'confirmed') {
      patch.confirmationStatus = 'pending'
      patch.confirmedAt = null
    }
  }

  if (!Object.keys(patch).length) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })

  // hasOverlappingVisit() above is a read-then-write check, same shape as
  // the public booking endpoint's — the real guard against two admins
  // reassigning into the same slot concurrently is visits_agent_slot_unique
  // (migration 0050), whose violation is translated into the same 409.
  try {
    await db.update(schema.visits).set(patch).where(eq(schema.visits.id, visitId))
  } catch (e: any) {
    if (isUniqueConstraintError(e)) {
      throw createError({ statusCode: 409, statusMessage: 'Ese agente ya tiene otra cita en ese horario.' })
    }
    throw e
  }

  const activityContactId = visit.leadId ? ((await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(eq(schema.leads.id, visit.leadId)).limit(1))[0]?.contactId ?? null) : null
  const activityBase = { entityType: 'visit' as const, entityId: visitId, appointmentId: visitId, leadId: visit.leadId, contactId: activityContactId, propertyId: visit.propertyId, propertyKind: visit.propertyKind as any, actorType: ctx.actorType ?? ('user' as const), actorId: ctx.userId }
  if (patch.status === 'cancelled') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'APPOINTMENT_CANCELLED' })
  } else if (patch.status === 'completed' && visit.type === 'property_viewing') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'VIEWING_COMPLETED' })
  } else if (patch.status === 'no_show' && visit.type === 'property_viewing') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'VIEWING_NO_SHOW' })
  }
  if (patch.scheduledAt && patch.scheduledAt !== visit.scheduledAt && patch.status !== 'cancelled') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'APPOINTMENT_RESCHEDULED', metadata: { from: visit.scheduledAt, to: patch.scheduledAt } })
  }
  // Cancelar, completar o mover la cita puede cambiar cuál es la próxima acción del lead (FASE 22).
  if (visit.leadId && (patch.status !== undefined || patch.scheduledAt !== undefined)) await syncLeadNextAction(db, orgId, visit.leadId)

  try {
    if (patch.status === 'cancelled') {
      await notifyAppointment(db, ctx.env, {
        organizationId: orgId,
        visitId,
        type: 'cancelled',
        recipientEmail: visit.clientEmail,
        recipientPhone: visit.clientPhone,
        message: `Tu cita del ${visit.scheduledAt} con ${visit.agentName || 'tu agente'} ha sido cancelada.`,
        scheduledAt: visit.scheduledAt,
        agentName: visit.agentName,
        requestId: ctx.requestId ?? null,
        publicOrigin: ctx.publicOrigin ?? null,
      })
    } else if (patch.scheduledAt && patch.scheduledAt !== visit.scheduledAt) {
      await notifyAppointment(db, ctx.env, {
        organizationId: orgId,
        visitId,
        type: 'rescheduled',
        recipientEmail: visit.clientEmail,
        recipientPhone: visit.clientPhone,
        message: `Tu cita ha sido reprogramada al ${patch.scheduledAt} con ${patch.agentName || visit.agentName || 'tu agente'}.`,
        scheduledAt: patch.scheduledAt,
        agentName: patch.agentName || visit.agentName,
        requestId: ctx.requestId ?? null,
        publicOrigin: ctx.publicOrigin ?? null,
      })
    }
  } catch {
    // El cambio ya quedó guardado — un fallo al notificar nunca debe deshacerlo.
  }

  return { before: visit, patch }
}

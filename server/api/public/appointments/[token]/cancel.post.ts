import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv, now } from '../../../../utils/db'
import { notifyAppointment } from '../../../../utils/appointments/notifications'
import { rateLimit } from '../../../../utils/rateLimit'
import { getRequestId } from '../../../../utils/requestId'
import { recordActivity } from '../../../../utils/activity/service'
import { syncLeadNextAction } from '../../../../utils/leads/nextAction'

/** Client-initiated cancellation via their own management link — no admin session involved. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'appointment-manage', { limit: 30, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const db = useDb(event)
  const rows = await db.select().from(schema.visits).where(eq(schema.visits.managementToken, token)).limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })
  if (visit.status !== 'scheduled') throw createError({ statusCode: 422, statusMessage: 'Esta cita ya no está activa' })

  // Toda cancelación lleva su motivo y su fecha (FASE 17): aquí, que la canceló el propio cliente.
  const ts = now()
  await db.update(schema.visits).set({ status: 'cancelled', cancellationReason: 'Cancelada por el cliente desde su enlace', cancelledAt: ts, updatedAt: ts }).where(eq(schema.visits.id, visit.id))

  try {
    await notifyAppointment(db, cfEnv(event), {
      organizationId: visit.organizationId,
      visitId: visit.id,
      type: 'cancelled',
      recipientEmail: visit.clientEmail,
      recipientPhone: visit.clientPhone,
      message: `Has cancelado tu cita del ${visit.scheduledAt} con ${visit.agentName || 'tu agente'}.`,
      scheduledAt: visit.scheduledAt,
      agentName: visit.agentName,
      requestId: getRequestId(event),
      publicOrigin: getRequestURL(event).origin,
    })
  } catch {
    // La cancelación ya quedó guardada.
  }

  const contactId = visit.leadId ? ((await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(eq(schema.leads.id, visit.leadId)).limit(1))[0]?.contactId ?? null) : null
  await recordActivity(db, visit.organizationId, {
    eventType: 'APPOINTMENT_CANCELLED',
    entityType: 'visit',
    entityId: visit.id,
    appointmentId: visit.id,
    leadId: visit.leadId,
    contactId,
    propertyId: visit.propertyId,
    propertyKind: visit.propertyKind as any,
    actorType: 'contact',
  })
  if (visit.leadId) await syncLeadNextAction(db, visit.organizationId, visit.leadId)

  return { ok: true }
})

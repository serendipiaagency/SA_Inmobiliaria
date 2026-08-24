import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../../utils/db'
import { notifyAppointment } from '../../../../utils/appointments/notifications'
import { rateLimit } from '../../../../utils/rateLimit'

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

  await db.update(schema.visits).set({ status: 'cancelled' }).where(eq(schema.visits.id, visit.id))

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
    })
  } catch {
    // La cancelación ya quedó guardada.
  }

  return { ok: true }
})

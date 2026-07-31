import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../../utils/db'
import { isSlotAvailable } from '../../../../utils/appointments/availability'
import { notifyAppointment } from '../../../../utils/appointments/notifications'
import { rateLimit } from '../../../../utils/rateLimit'

const SLOT_START_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** Client-initiated reschedule via their own management link — real slot re-check, excluding their own current booking. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'appointment-manage', { limit: 30, windowSeconds: 600 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const body = await readBody<{ startAt?: string }>(event)
  if (!body?.startAt || !SLOT_START_RE.test(body.startAt)) throw createError({ statusCode: 422, statusMessage: 'startAt inválido' })

  const db = useDb(event)
  const rows = await db.select().from(schema.visits).where(eq(schema.visits.managementToken, token)).limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })
  if (visit.status !== 'scheduled') throw createError({ statusCode: 422, statusMessage: 'Esta cita ya no está activa' })
  if (!visit.agentId) throw createError({ statusCode: 422, statusMessage: 'Esta cita no tiene un agente asignado' })

  const agentRows = await db
    .select({ slotDurationMinutes: schema.teamMembers.slotDurationMinutes, bufferMinutes: schema.teamMembers.bufferMinutes, maxAppointmentsPerDay: schema.teamMembers.maxAppointmentsPerDay })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.id, visit.agentId))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })

  const available = await isSlotAvailable(db, visit.organizationId, visit.agentId, body.startAt, agent.slotDurationMinutes, {
    bufferMinutes: agent.bufferMinutes,
    maxAppointmentsPerDay: agent.maxAppointmentsPerDay,
    excludeVisitId: visit.id,
  })
  if (!available) throw createError({ statusCode: 409, statusMessage: 'Ese horario ya no está disponible, elige otro.' })

  const endsAt = new Date(new Date(`${body.startAt.replace(' ', 'T')}Z`).getTime() + agent.slotDurationMinutes * 60_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  await db
    .update(schema.visits)
    .set({ scheduledAt: body.startAt, endsAt, reminder24hSentAt: null, reminder1hSentAt: null })
    .where(eq(schema.visits.id, visit.id))

  try {
    await notifyAppointment(db, cfEnv(event), {
      organizationId: visit.organizationId,
      visitId: visit.id,
      type: 'rescheduled',
      recipientEmail: visit.clientEmail,
      recipientPhone: visit.clientPhone,
      subject: `Cita reprogramada con ${visit.agentName || 'tu agente'}`,
      message: `Tu cita con ${visit.agentName || 'tu agente'} ha sido reprogramada al ${body.startAt}.`,
    })
  } catch {
    // El cambio ya quedó guardado.
  }

  return { ok: true, scheduledAt: body.startAt, endsAt }
})

import { and, eq } from 'drizzle-orm'
import { useDb, schema, now, cfEnv } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { hasOverlappingVisit } from '../../../../utils/appointments/availability'
import { notifyAppointment } from '../../../../utils/appointments/notifications'
import { logAdminAction } from '../../../../utils/audit'

const VALID_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

interface PatchVisitBody {
  status?: string
  scheduledAt?: string
  agentId?: number | null
}

/** Confirm/cancel/mark-completed/mark-no-show, reschedule, and/or reassign to a different agent — all with a real double-booking check. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const visitId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(visitId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const rows = await db.select().from(schema.visits).where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId))).limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })

  const body = await readBody<PatchVisitBody>(event)
  const patch: Record<string, any> = {}

  if (body?.status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(body.status)) throw createError({ statusCode: 422, statusMessage: 'Estado inválido' })
    patch.status = body.status
  }

  const nextAgentId = body?.agentId !== undefined ? body.agentId : visit.agentId
  const nextScheduledAt = body?.scheduledAt !== undefined ? body.scheduledAt : visit.scheduledAt
  const agentOrTimeChanged = (body?.agentId !== undefined && body.agentId !== visit.agentId) || (body?.scheduledAt !== undefined && body.scheduledAt !== visit.scheduledAt)

  if (agentOrTimeChanged) {
    if (!nextScheduledAt || !DATETIME_RE.test(nextScheduledAt)) throw createError({ statusCode: 422, statusMessage: 'scheduledAt inválido' })
    if (nextAgentId) {
      let durationMinutes = visit.durationMinutes
      if (body?.agentId !== undefined && body.agentId !== visit.agentId) {
        const agentRows = await db
          .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
          .from(schema.teamMembers)
          .where(and(eq(schema.teamMembers.id, nextAgentId), eq(schema.teamMembers.organizationId, orgId)))
          .limit(1)
        if (!agentRows[0]) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })
        durationMinutes = agentRows[0].slotDurationMinutes
        patch.agentId = agentRows[0].id
        patch.agentName = agentRows[0].name
      }
      const endsAt = new Date(new Date(`${nextScheduledAt.replace(' ', 'T')}Z`).getTime() + durationMinutes * 60_000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
      const conflict = await hasOverlappingVisit(db, orgId, nextAgentId, nextScheduledAt, endsAt, visitId)
      if (conflict) throw createError({ statusCode: 409, statusMessage: 'Ese agente ya tiene otra cita en ese horario.' })
      patch.scheduledAt = nextScheduledAt
      patch.durationMinutes = durationMinutes
      patch.endsAt = endsAt
    } else {
      patch.scheduledAt = nextScheduledAt
    }
  }

  if (!Object.keys(patch).length) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })

  await db.update(schema.visits).set(patch).where(eq(schema.visits.id, visitId))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit', resourceId: visitId })

  try {
    if (patch.status === 'cancelled') {
      await notifyAppointment(db, cfEnv(event), {
        organizationId: orgId,
        visitId,
        type: 'cancelled',
        recipientEmail: visit.clientEmail,
        recipientPhone: visit.clientPhone,
        subject: `Cita cancelada con ${visit.agentName || 'tu agente'}`,
        message: `Tu cita del ${visit.scheduledAt} con ${visit.agentName || 'tu agente'} ha sido cancelada.`,
      })
    } else if (patch.scheduledAt && patch.scheduledAt !== visit.scheduledAt) {
      await notifyAppointment(db, cfEnv(event), {
        organizationId: orgId,
        visitId,
        type: 'rescheduled',
        recipientEmail: visit.clientEmail,
        recipientPhone: visit.clientPhone,
        subject: `Cita reprogramada con ${patch.agentName || visit.agentName || 'tu agente'}`,
        message: `Tu cita ha sido reprogramada al ${patch.scheduledAt} con ${patch.agentName || visit.agentName || 'tu agente'}.`,
      })
    }
  } catch {
    // El cambio ya quedó guardado — un fallo al notificar nunca debe deshacerlo.
  }

  return { ok: true }
})

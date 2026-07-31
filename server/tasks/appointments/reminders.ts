import { drizzle } from 'drizzle-orm/d1'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { notifyAppointment } from '../../utils/appointments/notifications'

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Runs every minute (piggybacks on the existing "* * * * *" cron the
 * Publication Scheduler already uses). A ±30min window per reminder plus
 * the `reminder_*_sent_at IS NULL` guard means a visit gets exactly one
 * 24h and one 1h reminder no matter how many times this tick catches it
 * inside that window — cross-tenant by design, same reasoning as
 * scheduler:dispatch: a platform-level Cron Trigger has no single org's
 * request context.
 */
export default defineTask({
  meta: {
    name: 'appointments:reminders',
    description: 'Sends 24h/1h reminders for upcoming scheduled appointments across every organization',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })
    const now = new Date()

    const due24h = await db
      .select()
      .from(schema.visits)
      .where(
        and(
          eq(schema.visits.status, 'scheduled'),
          isNull(schema.visits.reminder24hSentAt),
          gte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + 23.5 * 60 * 60 * 1000))),
          lte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + 24.5 * 60 * 60 * 1000))),
        ),
      )
    let sent24h = 0
    for (const visit of due24h) {
      if (visit.clientEmail || visit.clientPhone) {
        await notifyAppointment(db, env, {
          organizationId: visit.organizationId,
          visitId: visit.id,
          type: 'reminder_24h',
          recipientEmail: visit.clientEmail,
          recipientPhone: visit.clientPhone,
          subject: `Recordatorio: cita mañana con ${visit.agentName || 'tu agente'}`,
          message: `Recordatorio: tienes una cita el ${visit.scheduledAt} con ${visit.agentName || 'tu agente'}.`,
        })
        sent24h++
      }
      await db.update(schema.visits).set({ reminder24hSentAt: fmt(now) }).where(eq(schema.visits.id, visit.id))
    }

    const due1h = await db
      .select()
      .from(schema.visits)
      .where(
        and(
          eq(schema.visits.status, 'scheduled'),
          isNull(schema.visits.reminder1hSentAt),
          gte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + 50 * 60 * 1000))),
          lte(schema.visits.scheduledAt, fmt(new Date(now.getTime() + 70 * 60 * 1000))),
        ),
      )
    let sent1h = 0
    for (const visit of due1h) {
      if (visit.clientEmail || visit.clientPhone) {
        await notifyAppointment(db, env, {
          organizationId: visit.organizationId,
          visitId: visit.id,
          type: 'reminder_1h',
          recipientEmail: visit.clientEmail,
          recipientPhone: visit.clientPhone,
          subject: 'Recordatorio: tu cita es en 1 hora',
          message: `Recordatorio: tu cita con ${visit.agentName || 'tu agente'} es a las ${visit.scheduledAt.slice(11, 16)}.`,
        })
        sent1h++
      }
      await db.update(schema.visits).set({ reminder1hSentAt: fmt(now) }).where(eq(schema.visits.id, visit.id))
    }

    return { result: { sent24h, sent1h } }
  },
})

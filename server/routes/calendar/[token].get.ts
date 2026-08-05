import { and, eq, gte, ne } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'

/**
 * Private iCal feed for one agent's appointments — "subscribe by URL" in
 * Google Calendar/Outlook. Deliberately unauthenticated beyond the token
 * itself (same pattern as the dynamic QR short-link route): a calendar app
 * subscribing to a URL can't send a session cookie, so the token IS the
 * credential — same reasoning, real limitation: this is one-way (export
 * only). Reading the agent's *external* calendar back into this app's
 * availability would need real OAuth (Google/Microsoft), which isn't
 * available in this deployment.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')?.replace(/\.ics$/, '')
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDb(event)
  const agentRows = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.icalToken, token)).limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const visits = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.agentId, agent.id), ne(schema.visits.status, 'cancelled'), gte(schema.visits.scheduledAt, now().slice(0, 10))))

  const toIcsDate = (dt: string) => `${dt.replace(/[-:]/g, '').replace(' ', 'T')}Z`
  const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  const events = visits
    .map((v) => {
      const summary = `${v.clientName}${v.propertyName ? ` — ${v.propertyName}` : ''}`
      const description = [v.channel === 'video' ? 'Videollamada' : v.channel === 'phone' ? 'Llamada' : 'Presencial', v.videoLink].filter(Boolean).join('\n')
      return [
        'BEGIN:VEVENT',
        `UID:visit-${v.id}@sa-inmobiliaria`,
        `DTSTAMP:${toIcsDate(now())}`,
        `DTSTART:${toIcsDate(v.scheduledAt)}`,
        `DTEND:${toIcsDate(v.endsAt || v.scheduledAt)}`,
        `SUMMARY:${icsEscape(summary)}`,
        description ? `DESCRIPTION:${icsEscape(description)}` : '',
        `STATUS:${v.status === 'completed' ? 'CONFIRMED' : 'CONFIRMED'}`,
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n')
    })
    .join('\r\n')

  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SA Inmobiliaria//Agenda de citas//ES', `X-WR-CALNAME:Citas — ${icsEscape(agent.name)}`, events, 'END:VCALENDAR']
    .filter(Boolean)
    .join('\r\n')

  setResponseHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'inline; filename="agenda.ics"')
  return body
})

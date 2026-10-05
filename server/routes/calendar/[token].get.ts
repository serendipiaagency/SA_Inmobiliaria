import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { buildAgentIcs } from '../../utils/appointments/ical'

/**
 * Private iCal feed for one agent's appointments — "subscribe by URL" in
 * Google Calendar/Outlook. Deliberately unauthenticated beyond the token
 * itself (same pattern as the dynamic QR short-link route): a calendar app
 * subscribing to a URL can't send a session cookie, so the token IS the
 * credential — same reasoning, real limitation: this is one-way (export
 * only). Reading the agent's *external* calendar back into this app's
 * availability would need real OAuth (Google/Microsoft), which isn't
 * available in this deployment.
 *
 * Las horas salen en UTC real, convertidas con la zona horaria de cada cita
 * (server/utils/appointments/ical.ts): antes la hora local se marcaba como UTC.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')?.replace(/\.ics$/, '')
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDb(event)
  const agentRows = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, organizationId: schema.teamMembers.organizationId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.icalToken, token))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await buildAgentIcs(db, agent)

  setResponseHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'inline; filename="agenda.ics"')
  return body
})

import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { rateLimit } from '../../../utils/rateLimit'

/** Self-service lookup: GET /api/public/appointments/:token — the management token itself is the auth, no session needed. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'appointment-manage', { limit: 30, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.visits.id,
      clientName: schema.visits.clientName,
      propertyName: schema.visits.propertyName,
      agentId: schema.visits.agentId,
      agentName: schema.visits.agentName,
      agentSlug: schema.teamMembers.slug,
      scheduledAt: schema.visits.scheduledAt,
      endsAt: schema.visits.endsAt,
      status: schema.visits.status,
      channel: schema.visits.channel,
      videoLink: schema.visits.videoLink,
    })
    .from(schema.visits)
    .leftJoin(schema.teamMembers, eq(schema.teamMembers.id, schema.visits.agentId))
    .where(eq(schema.visits.managementToken, token))
    .limit(1)

  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })
  return { visit }
})

import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { computeAvailableSlots } from '../../../../utils/appointments/availability'
import { rateLimit } from '../../../../utils/rateLimit'

const MAX_DAYS = 30

/** Public slot picker feed: GET /api/public/agents/:slug/availability?from=YYYY-MM-DD&days=14 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'agent-availability', { limit: 60, windowSeconds: 60 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const agentRows = await db
    .select({
      id: schema.teamMembers.id,
      name: schema.teamMembers.name,
      slotDurationMinutes: schema.teamMembers.slotDurationMinutes,
      bufferMinutes: schema.teamMembers.bufferMinutes,
      maxAppointmentsPerDay: schema.teamMembers.maxAppointmentsPerDay,
    })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.slug, slug), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })

  const q = getQuery(event)
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from || '')) ? String(q.from) : new Date().toISOString().slice(0, 10)
  const days = Math.min(MAX_DAYS, Math.max(1, Number(q.days) || 14))

  const fromDate = new Date(`${fromStr}T00:00:00Z`)
  const options = { bufferMinutes: agent.bufferMinutes, maxAppointmentsPerDay: agent.maxAppointmentsPerDay }
  const results: { date: string; slots: { start: string; end: string }[] }[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(fromDate)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    const slots = await computeAvailableSlots(db, orgId, agent.id, dateStr, agent.slotDurationMinutes, options)
    results.push({ date: dateStr, slots })
  }

  return { agent: { id: agent.id, name: agent.name, slotDurationMinutes: agent.slotDurationMinutes }, days: results }
})

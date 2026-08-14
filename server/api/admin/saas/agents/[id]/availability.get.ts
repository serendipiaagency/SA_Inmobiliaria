import { and, eq, gte } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const agentId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(agentId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const agentRows = await db
    .select({
      id: schema.teamMembers.id,
      name: schema.teamMembers.name,
      slotDurationMinutes: schema.teamMembers.slotDurationMinutes,
      bufferMinutes: schema.teamMembers.bufferMinutes,
      maxAppointmentsPerDay: schema.teamMembers.maxAppointmentsPerDay,
      icalToken: schema.teamMembers.icalToken,
    })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, agentId), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agente no encontrado' })

  // Lazily mint the private calendar-feed token on first request rather than at seed/creation time.
  if (!agent.icalToken) {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    agent.icalToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    await db.update(schema.teamMembers).set({ icalToken: agent.icalToken }).where(eq(schema.teamMembers.id, agentId))
  }

  const rules = await db
    .select({ id: schema.agentAvailability.id, dayOfWeek: schema.agentAvailability.dayOfWeek, startTime: schema.agentAvailability.startTime, endTime: schema.agentAvailability.endTime })
    .from(schema.agentAvailability)
    .where(and(eq(schema.agentAvailability.organizationId, orgId), eq(schema.agentAvailability.agentId, agentId)))
    .orderBy(schema.agentAvailability.dayOfWeek, schema.agentAvailability.startTime)

  const timeOff = await db
    .select({ id: schema.agentTimeOff.id, date: schema.agentTimeOff.date, reason: schema.agentTimeOff.reason })
    .from(schema.agentTimeOff)
    .where(and(eq(schema.agentTimeOff.organizationId, orgId), eq(schema.agentTimeOff.agentId, agentId), gte(schema.agentTimeOff.date, now().slice(0, 10))))
    .orderBy(schema.agentTimeOff.date)

  return { agent, rules, timeOff }
})

import { and, eq, gte } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { timeToMinutes } from '../../../utils/appointments/availability'

/**
 * Real usage metrics over the agenda — no-show rate, per-agent occupancy
 * (booked slots ÷ theoretical capacity from each agent's own weekly rules
 * minus their time-off), and cita→venta conversion (completed visits whose
 * matching lead, by email, reached `won`). All computed from actual rows,
 * not placeholders.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)
  const days = Math.min(365, Math.max(1, Number(q.days) || 30))

  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const fromStr = `${fromDate.toISOString().slice(0, 10)} 00:00:00`

  const visits = await db.select().from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), gte(schema.visits.scheduledAt, fromStr)))

  const scheduled = visits.filter((v) => v.status === 'scheduled').length
  const completed = visits.filter((v) => v.status === 'completed').length
  const noShow = visits.filter((v) => v.status === 'no_show').length
  const cancelled = visits.filter((v) => v.status === 'cancelled').length
  const noShowRate = completed + noShow > 0 ? noShow / (completed + noShow) : null

  const completedWithEmail = visits.filter((v) => v.status === 'completed' && v.clientEmail)
  let convertedCount = 0
  for (const v of completedWithEmail) {
    const leadRows = await db
      .select({ status: schema.leads.status })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.email, v.clientEmail!)))
      .limit(1)
    if (leadRows[0]?.status === 'won') convertedCount++
  }
  const conversionRate = completedWithEmail.length > 0 ? convertedCount / completedWithEmail.length : null

  const agents = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
  const rules = await db.select().from(schema.agentAvailability).where(eq(schema.agentAvailability.organizationId, orgId))
  const timeOffRows = await db
    .select({ agentId: schema.agentTimeOff.agentId, date: schema.agentTimeOff.date })
    .from(schema.agentTimeOff)
    .where(and(eq(schema.agentTimeOff.organizationId, orgId), gte(schema.agentTimeOff.date, fromDate.toISOString().slice(0, 10))))

  const perAgent = agents.map((agent) => {
    const agentRules = rules.filter((r) => r.agentId === agent.id)
    const blockedDates = new Set(timeOffRows.filter((t) => t.agentId === agent.id).map((t) => t.date))
    let capacitySlots = 0
    for (let i = 0; i < days; i++) {
      const d = new Date(fromDate.getTime() + i * 86_400_000)
      const dateStr = d.toISOString().slice(0, 10)
      if (blockedDates.has(dateStr)) continue
      const dow = d.getUTCDay()
      for (const r of agentRules.filter((r) => r.dayOfWeek === dow)) {
        capacitySlots += Math.floor((timeToMinutes(r.endTime) - timeToMinutes(r.startTime)) / agent.slotDurationMinutes)
      }
    }
    const bookedCount = visits.filter((v) => v.agentId === agent.id && v.status !== 'cancelled').length
    const occupancy = capacitySlots > 0 ? bookedCount / capacitySlots : null
    return { agentId: agent.id, name: agent.name, bookedCount, capacitySlots, occupancy }
  })

  return {
    days,
    totals: { scheduled, completed, noShow, cancelled, noShowRate, conversionRate, consideredForConversion: completedWithEmail.length, convertedCount },
    perAgent,
  }
})

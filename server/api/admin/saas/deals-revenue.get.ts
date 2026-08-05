import { and, eq, gte } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Real revenue aggregation from `deals` — grouped by month and by agent, computed from actual rows, never estimated. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)
  const months = Math.min(24, Math.max(1, Number(q.months) || 12))
  const fromDate = new Date()
  fromDate.setMonth(fromDate.getMonth() - months)
  const fromStr = fromDate.toISOString().slice(0, 10)

  const rows = await db
    .select()
    .from(schema.deals)
    .where(and(eq(schema.deals.organizationId, orgId), gte(schema.deals.closedAt, fromStr)))

  const totals = {
    dealCount: rows.length,
    totalRevenue: 0,
    totalCommission: 0,
    commissionPaid: 0,
    commissionPending: 0,
  }
  const byMonth = new Map<string, { month: string; revenue: number; commission: number; count: number }>()
  const byAgent = new Map<string, { agentId: number | null; agentName: string; revenue: number; commission: number; commissionPaid: number; commissionPending: number; count: number }>()

  for (const d of rows) {
    totals.totalRevenue += d.dealValue
    totals.totalCommission += d.commissionAmount
    if (d.commissionPaid) totals.commissionPaid += d.commissionAmount
    else totals.commissionPending += d.commissionAmount

    const month = d.closedAt.slice(0, 7)
    const m = byMonth.get(month) || { month, revenue: 0, commission: 0, count: 0 }
    m.revenue += d.dealValue
    m.commission += d.commissionAmount
    m.count += 1
    byMonth.set(month, m)

    const agentKey = String(d.agentId ?? d.agentName ?? 'sin-agente')
    const a = byAgent.get(agentKey) || { agentId: d.agentId, agentName: d.agentName || 'Sin agente', revenue: 0, commission: 0, commissionPaid: 0, commissionPending: 0, count: 0 }
    a.revenue += d.dealValue
    a.commission += d.commissionAmount
    if (d.commissionPaid) a.commissionPaid += d.commissionAmount
    else a.commissionPending += d.commissionAmount
    a.count += 1
    byAgent.set(agentKey, a)
  }

  return {
    totals,
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byAgent: [...byAgent.values()].sort((a, b) => b.revenue - a.revenue),
  }
})

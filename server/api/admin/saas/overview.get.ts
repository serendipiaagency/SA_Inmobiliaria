import { requireOrgScope } from '../../../utils/auth'

/**
 * Dashboard overview: KPI cards with month-over-month deltas, a revenue/visitor
 * time series, the lead funnel, lead-source split, agent leaderboard and a
 * recent-activity feed. Everything is scoped to the active organization.
 * Invoices stay global by explicit decision — outstanding/pendingInvoices
 * intentionally still reflect platform-wide billing, not per-org billing.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database

  const anchorRow = await raw.prepare('SELECT max(day) AS d FROM metrics_daily WHERE organization_id = ?1').bind(orgId).first<{ d: string }>()
  const anchor = anchorRow?.d || new Date().toISOString().slice(0, 10)

  // Time series (last 90 days up to anchor)
  const series = (
    await raw
      .prepare(
        `SELECT day, visitors, pageviews, leads, visits_booked AS visitsBooked, reservations, revenue
         FROM metrics_daily WHERE organization_id = ?1 AND day <= ?2 ORDER BY day DESC LIMIT 90`,
      )
      .bind(orgId, anchor)
      .all<any>()
  ).results.reverse()

  // KPI windows: last 30 days vs the 30 before that
  function windowSum(days: any[]) {
    return days.reduce(
      (a, r) => ({
        visitors: a.visitors + r.visitors,
        leads: a.leads + r.leads,
        reservations: a.reservations + r.reservations,
        revenue: a.revenue + r.revenue,
      }),
      { visitors: 0, leads: 0, reservations: 0, revenue: 0 },
    )
  }
  const cur = windowSum(series.slice(-30))
  const prev = windowSum(series.slice(-60, -30))
  const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 1000) / 10)

  // Lead funnel
  const funnelRows = (
    await raw.prepare('SELECT status, count(*) AS n FROM leads WHERE organization_id = ?1 GROUP BY status').bind(orgId).all<{ status: string; n: number }>()
  ).results
  const funnelMap: Record<string, number> = {}
  for (const r of funnelRows) funnelMap[r.status] = r.n

  // Lead sources
  const sources = (
    await raw.prepare('SELECT source, count(*) AS n FROM leads WHERE organization_id = ?1 GROUP BY source ORDER BY n DESC').bind(orgId).all<{ source: string; n: number }>()
  ).results

  // Agent leaderboard: won leads + confirmed/completed reservation value
  const agentLeads = (
    await raw
      .prepare(`SELECT agent_name AS agent, count(*) AS leads, sum(CASE WHEN status='won' THEN 1 ELSE 0 END) AS won FROM leads WHERE organization_id = ?1 AND agent_name IS NOT NULL GROUP BY agent_name`)
      .bind(orgId)
      .all<any>()
  ).results
  // reservations aren't tied to agents; approximate leaderboard from leads
  const leaderboard = agentLeads
    .map((a: any) => ({ agent: a.agent, leads: a.leads, won: a.won, winRate: a.leads ? Math.round((a.won / a.leads) * 100) : 0 }))
    .sort((x: any, y: any) => y.won - x.won || y.leads - x.leads)
    .slice(0, 5)

  // Totals
  const totals = {
    leads: (await raw.prepare('SELECT count(*) AS n FROM leads WHERE organization_id = ?1').bind(orgId).first<{ n: number }>())?.n || 0,
    clients: (await raw.prepare("SELECT count(*) AS n FROM clients WHERE organization_id = ?1 AND stage='active'").bind(orgId).first<{ n: number }>())?.n || 0,
    properties:
      ((await raw.prepare('SELECT count(*) AS n FROM developer_properties WHERE organization_id = ?1').bind(orgId).first<{ n: number }>())?.n || 0) +
      ((await raw.prepare('SELECT count(*) AS n FROM agent_properties WHERE organization_id = ?1').bind(orgId).first<{ n: number }>())?.n || 0),
    upcomingVisits: (await raw.prepare("SELECT count(*) AS n FROM visits WHERE organization_id = ?1 AND status='scheduled'").bind(orgId).first<{ n: number }>())?.n || 0,
    pendingInvoices: (await raw.prepare("SELECT count(*) AS n FROM invoices WHERE status IN ('pending','overdue')").first<{ n: number }>())?.n || 0,
    outstanding:
      (await raw.prepare("SELECT coalesce(sum(amount+tax),0) AS s FROM invoices WHERE status IN ('pending','overdue')").first<{ s: number }>())?.s || 0,
  }

  // Recent activity feed (union of recent leads, reservations, visits)
  const recentLeads = (
    await raw.prepare("SELECT name, status, source, created_at FROM leads WHERE organization_id = ?1 ORDER BY created_at DESC LIMIT 6").bind(orgId).all<any>()
  ).results.map((r: any) => ({ type: 'lead', title: r.name, meta: `${r.source} · ${r.status}`, at: r.created_at }))
  const recentRes = (
    await raw.prepare("SELECT reference, client_name, amount, status, created_at FROM reservations WHERE organization_id = ?1 ORDER BY created_at DESC LIMIT 6").bind(orgId).all<any>()
  ).results.map((r: any) => ({ type: 'reservation', title: `${r.client_name}`, meta: `${r.reference} · ${r.status}`, at: r.created_at, amount: r.amount }))
  const upcoming = (
    await raw.prepare("SELECT client_name, property_name, scheduled_at FROM visits WHERE organization_id = ?1 AND status='scheduled' ORDER BY scheduled_at ASC LIMIT 6").bind(orgId).all<any>()
  ).results.map((r: any) => ({ type: 'visit', title: r.client_name, meta: r.property_name, at: r.scheduled_at }))

  return {
    anchor,
    kpis: {
      revenue: { value: cur.revenue, delta: pct(cur.revenue, prev.revenue) },
      leads: { value: cur.leads, delta: pct(cur.leads, prev.leads) },
      reservations: { value: cur.reservations, delta: pct(cur.reservations, prev.reservations) },
      visitors: { value: cur.visitors, delta: pct(cur.visitors, prev.visitors) },
      conversion: {
        value: cur.visitors ? Math.round((cur.reservations / cur.visitors) * 1000) / 10 : 0,
        delta: pct(
          cur.visitors ? cur.reservations / cur.visitors : 0,
          prev.visitors ? prev.reservations / prev.visitors : 0,
        ),
      },
    },
    totals,
    series,
    funnel: funnelMap,
    sources,
    leaderboard,
    activity: { recentLeads, recentRes, upcoming },
  }
})

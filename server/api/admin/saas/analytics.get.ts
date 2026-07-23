import { requireOrgScope } from '../../../utils/auth'

/**
 * Analytics: daily time series over a selectable range, the acquisition funnel
 * (visitors → leads → visits → reservations), traffic sources and top days.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const range = Math.min(Math.max(parseInt(String(q.range || '30'), 10) || 30, 7), 120)

  const anchor = (await raw.prepare('SELECT max(day) AS d FROM metrics_daily WHERE organization_id = ?1').bind(orgId).first<{ d: string }>())?.d
  const series = (
    await raw
      .prepare(
        `SELECT day, visitors, pageviews, leads, visits_booked AS visitsBooked, reservations, revenue
         FROM metrics_daily WHERE organization_id = ?1 AND day <= ?2 ORDER BY day DESC LIMIT ?3`,
      )
      .bind(orgId, anchor, range)
      .all<any>()
  ).results.reverse()

  const sum = (k: string) => series.reduce((a: number, r: any) => a + (r[k] || 0), 0)
  const totals = {
    visitors: sum('visitors'),
    pageviews: sum('pageviews'),
    leads: sum('leads'),
    visitsBooked: sum('visitsBooked'),
    reservations: sum('reservations'),
    revenue: sum('revenue'),
  }
  const funnel = [
    { stage: 'Visitantes', value: totals.visitors },
    { stage: 'Leads', value: totals.leads },
    { stage: 'Visitas agendadas', value: totals.visitsBooked },
    { stage: 'Reservas', value: totals.reservations },
  ]

  const sources = (
    await raw.prepare('SELECT source, count(*) AS n FROM leads WHERE organization_id = ?1 GROUP BY source ORDER BY n DESC').bind(orgId).all<{ source: string; n: number }>()
  ).results

  const clientTypes = (
    await raw.prepare('SELECT type, count(*) AS n FROM clients WHERE organization_id = ?1 GROUP BY type ORDER BY n DESC').bind(orgId).all<{ type: string; n: number }>()
  ).results

  return { range, anchor, series, totals, funnel, sources, clientTypes }
})

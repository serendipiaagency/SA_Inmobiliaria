import { requireAdmin } from '../../../utils/auth'

/**
 * Analytics: daily time series over a selectable range, the acquisition funnel
 * (visitors → leads → visits → reservations), traffic sources and top days.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const range = Math.min(Math.max(parseInt(String(q.range || '30'), 10) || 30, 7), 120)

  const anchor = (await raw.prepare('SELECT max(day) AS d FROM metrics_daily').first<{ d: string }>())?.d
  const series = (
    await raw
      .prepare(
        `SELECT day, visitors, pageviews, leads, visits_booked AS visitsBooked, reservations, revenue
         FROM metrics_daily WHERE day <= ?1 ORDER BY day DESC LIMIT ?2`,
      )
      .bind(anchor, range)
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
    await raw.prepare('SELECT source, count(*) AS n FROM leads GROUP BY source ORDER BY n DESC').all<{ source: string; n: number }>()
  ).results

  const clientTypes = (
    await raw.prepare('SELECT type, count(*) AS n FROM clients GROUP BY type ORDER BY n DESC').all<{ type: string; n: number }>()
  ).results

  return { range, anchor, series, totals, funnel, sources, clientTypes }
})

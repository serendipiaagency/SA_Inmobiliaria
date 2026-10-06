import { eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { checkSlaForOrg } from '../../utils/leads/sla'
import { recomputeLeadScore } from '../../utils/leads/score'
import { clockNow } from '../../utils/clock'
import { dayAt, type DemoContext } from '../context'
import { leadId, orgId, propertyId } from '../helpers'
import { LEADS } from '../dataset/crm'
import { PROPERTIES } from '../dataset/properties'
import { SETUP_DAY } from './setup'
import type { TimelineBuilder } from '../timeline'

/**
 * Lo que en una agencia real hacen el tiempo y los visitantes:
 *
 *  - El control de SLA de los leads, cada mañana (el mismo `checkSlaForOrg`
 *    que el cron horario), para que las alertas se abran y se resuelvan en su
 *    fecha.
 *  - Las visitas a las fichas de obra nueva de la web, como registros de
 *    `property_views` (anónimos, con un id de visitante sintético), repartidas
 *    desde que se publica cada ficha.
 *  - Las métricas diarias (Analytics, Dashboard) calculadas A PARTIR de esos
 *    registros y de los leads, citas, reservas y cobros sembrados: ningún
 *    número se escribe a mano.
 *  - El lead score de cada lead, recalculado por sus reglas al final.
 */

/** Generador determinista (mulberry32): la misma demo da las mismas cifras. */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Interés relativo de cada promoción en la web (más alto, más visitas). */
const POPULARITY: Record<string, number> = { p01: 7, p02: 9, p03: 6, p04: 10, p05: 4, p06: 8, p07: 7, p08: 4, p09: 5, p10: 12 }

async function seedWebViews(ctx: DemoContext) {
  const anchor = ctx.state.anchorDay!
  const pool = 1400 // visitantes distintos que vuelven a lo largo de los meses
  for (const p of PROPERTIES.filter((x) => x.kind === 'developer')) {
    const rand = prng(Number(p.key.slice(1)) * 7919)
    const rows: { t: string; v: string }[] = []
    for (let d = p.days + 2; d <= -1; d++) {
      const weekday = new Date(`${dayAt(anchor, d)}T12:00:00Z`).getUTCDay()
      const weekend = weekday === 0 || weekday === 6 ? 1.4 : 1
      const n = Math.round((POPULARITY[p.key] ?? 5) * weekend * (0.5 + rand()))
      for (let i = 0; i < n; i++) {
        const hour = 7 + Math.floor(rand() * 15)
        const minute = Math.floor(rand() * 60)
        rows.push({ t: `${dayAt(anchor, d)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`, v: `demo-${Math.floor(rand() * pool)}` })
      }
    }
    if (!rows.length) continue
    // Un solo INSERT … SELECT por promoción (json_each), no una consulta por fila.
    await ctx.db.run(sql`
      INSERT INTO property_views (developer_property_id, created_at, visitor_id)
      SELECT ${propertyId(ctx, p.key)}, json_extract(value, '$.t'), json_extract(value, '$.v') FROM json_each(${JSON.stringify(rows)})`)
  }
  await ctx.db.run(sql`
    UPDATE developer_properties SET view_count = (SELECT count(*) FROM property_views pv WHERE pv.developer_property_id = developer_properties.id)
    WHERE organization_id = ${orgId(ctx)}`)
}

/** metrics_daily de toda la historia, calculado de los registros de la demo. */
async function computeMetricsDaily(ctx: DemoContext) {
  const org = orgId(ctx)
  const from = dayAt(ctx.state.anchorDay!, SETUP_DAY)
  const to = dayAt(ctx.state.anchorDay!, 0)
  await ctx.db.delete(schema.metricsDaily).where(eq(schema.metricsDaily.organizationId, org))
  await ctx.db.run(sql`
    INSERT INTO metrics_daily (organization_id, day, visitors, pageviews, leads, visits_booked, reservations, revenue)
    WITH RECURSIVE days(day) AS (SELECT date(${from}) UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date(${to}))
    SELECT ${org}, day,
      (SELECT count(DISTINCT pv.visitor_id) FROM property_views pv JOIN developer_properties dp ON dp.id = pv.developer_property_id WHERE dp.organization_id = ${org} AND substr(pv.created_at, 1, 10) = day),
      (SELECT count(*) FROM property_views pv JOIN developer_properties dp ON dp.id = pv.developer_property_id WHERE dp.organization_id = ${org} AND substr(pv.created_at, 1, 10) = day),
      (SELECT count(*) FROM leads WHERE organization_id = ${org} AND substr(created_at, 1, 10) = day),
      (SELECT count(*) FROM visits WHERE organization_id = ${org} AND substr(created_at, 1, 10) = day),
      (SELECT count(*) FROM reservations WHERE organization_id = ${org} AND substr(reserved_at, 1, 10) = day),
      (SELECT coalesce(sum(amount), 0) FROM invoices WHERE organization_id = ${org} AND status = 'paid' AND substr(paid_at, 1, 10) = day)
    FROM days`)
}

export function addAnalyticsEvents(tl: TimelineBuilder): void {
  // El control de SLA de cada mañana, desde que entra el primer lead.
  const firstLead = Math.min(...LEADS.map((l) => l.days))
  for (let d = firstLead + 1; d <= 0; d++) {
    tl.add(d, '09:05', `SLA ${d}`, async (ctx) => {
      await checkSlaForOrg(ctx.db, orgId(ctx))
    })
  }

  tl.add(0, '23:50', 'Visitas a la web', seedWebViews)
  // Lead score por sus reglas, en tandas (cada lead son varias consultas).
  for (let i = 0; i < LEADS.length; i += 10) {
    const batch = LEADS.slice(i, i + 10)
    tl.add(0, '23:52', `Lead score ${i / 10 + 1}`, async (ctx) => {
      for (const l of batch) await recomputeLeadScore(ctx.db, orgId(ctx), leadId(ctx, l.key), 'rules', clockNow().getTime())
    })
  }
  tl.add(0, '23:54', 'SLA al día', async (ctx) => {
    await checkSlaForOrg(ctx.db, orgId(ctx))
  })
  tl.add(0, '23:56', 'Métricas diarias', computeMetricsDaily)
}

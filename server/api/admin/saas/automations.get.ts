import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const rows = (
    await raw
      .prepare(
        `SELECT id, name, description, trigger, action, enabled, runs_count AS runsCount, last_run_at AS lastRunAt, created_at AS createdAt
         FROM automations ORDER BY enabled DESC, runs_count DESC`,
      )
      .all<any>()
  ).results
  const totalRuns = rows.reduce((a: number, r: any) => a + (r.runsCount || 0), 0)
  const active = rows.filter((r: any) => r.enabled).length
  return { rows, totalRuns, active, total: rows.length }
})

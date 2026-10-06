import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { organizationsWithActiveAutomations, runAutomationsForOrg } from '../../utils/automations/engine'

/**
 * Cada minuto (nuxt.config.ts scheduledTasks): procesa las automatizaciones
 * ACTIVAS de cada agencia con alguna (bloque N8b). Cada agencia por separado
 * y cada acción con el usuario que la configuró — ver
 * server/utils/automations/engine.ts. Un fallo en una agencia no frena a las
 * demás.
 */
export default defineTask<{ skipped: true; reason: string } | { orgs: number; events: number; ok: number; error: number; skipped: number; failedOrgs: number }>({
  meta: {
    name: 'automations:run',
    description: 'Ejecuta las automatizaciones activas de cada agencia sobre sus eventos nuevos',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })
    const totals = { orgs: 0, events: 0, ok: 0, error: 0, skipped: 0, failedOrgs: 0 }
    for (const orgId of await organizationsWithActiveAutomations(db)) {
      totals.orgs++
      try {
        const s = await runAutomationsForOrg(db, orgId, { env })
        totals.events += s.events
        totals.ok += s.ok
        totals.error += s.error
        totals.skipped += s.skipped
      } catch {
        totals.failedOrgs++
      }
    }
    return { result: totals }
  },
})

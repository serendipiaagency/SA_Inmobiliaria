import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { advanceDemoProvisioning, requestDemoProvisioning } from '../../demo/runner'
import { readDemoState } from '../../demo/state'

/**
 * Cada minuto (nuxt.config.ts scheduledTasks): avanza un tramo la generación
 * de la cuenta demo «Norte Astur Inmobiliaria» si hay una en curso (creación
 * o restablecimiento pedidos desde Sistemas > Empresas).
 *
 * Con DEMO_TENANT_AUTOPROVISION = "1" (wrangler.toml) además la crea sola la
 * primera vez, si todavía no existe. Nunca la restablece por su cuenta: borrar
 * sus datos sólo lo pide el super admin (o el reintento acotado de una
 * generación que falló a medias).
 */
type ProvisionResult = { skipped: true; reason: string } | { status: string; step: number; total: number | null; ran: number; busy: boolean; error: string | null }

export default defineTask<ProvisionResult>({
  meta: {
    name: 'demo:provision',
    description: 'Genera la cuenta demo por tramos (si hay una generación en curso)',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })
    const { state } = await readDemoState(db)
    if (!state) {
      if (env.DEMO_TENANT_AUTOPROVISION !== '1') return { result: { skipped: true, reason: 'Sin demo pedida' } }
      await requestDemoProvisioning(db, { reset: false, trigger: 'cron' })
    } else if (state.status === 'ready' || (state.status === 'failed' && state.attempts >= 3)) {
      return { result: { skipped: true, reason: `Demo ${state.status}` } }
    }
    const progress = await advanceDemoProvisioning(env, { trigger: 'cron' })
    return { result: { status: progress.status, step: progress.stepIndex, total: progress.total, ran: progress.ran, busy: progress.busy, error: progress.error } }
  },
})

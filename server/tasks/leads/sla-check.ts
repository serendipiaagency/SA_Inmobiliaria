import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { checkSlaForOrg } from '../../utils/leads/sla'
import { recomputeExpiredLeadScores } from '../../utils/leads/score'

/**
 * Runs hourly (nuxt.config.ts scheduledTasks). Los umbrales de SLA son por
 * organización (sla_settings), así que —a diferencia de otras tareas que
 * hacen una sola consulta sin filtrar por tenant— aquí sí hace falta
 * recorrer cada organización una a una.
 */
export default defineTask<{ skipped: true; reason: string } | { orgsChecked: number; scoresRefreshed: number }>({
  meta: {
    name: 'leads:sla-check',
    description: 'Abre y resuelve alertas de SLA de leads (sin atender, cualificado sin acción, inactivo) por organización',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.status, 'active'))
    let scoresRefreshed = 0
    for (const org of orgs) {
      await checkSlaForOrg(db, org.id)
      // FASE 32 — sólo los leads cuya señal temporal ya caducó («respondió
      // en las últimas 24 h», «compra en los próximos 90 días»…), nunca
      // el tenant entero (§70).
      scoresRefreshed += await recomputeExpiredLeadScores(db, org.id).catch(() => 0)
    }

    return { result: { orgsChecked: orgs.length, scoresRefreshed } }
  },
})

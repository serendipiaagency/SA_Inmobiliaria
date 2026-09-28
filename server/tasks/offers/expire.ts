import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../db/schema'
import { now } from '../../utils/db'
import { expireOffer } from '../../utils/offers/service'

/**
 * Runs hourly (see nuxt.config.ts scheduledTasks + wrangler.toml [triggers],
 * mismo slot que cms:expire-articles/leads:sla-check). Marca como `expired`
 * las ofertas `submitted`/`countered` cuya `expiration` ya pasó — cross-tenant,
 * porque un Cron Trigger de plataforma no tiene el contexto de un tenant
 * concreto. Usa `expireOffer()` (server/utils/offers/service.ts), nunca un
 * UPDATE directo: así también queda su revisión y su OFFER_EXPIRED en
 * Activity, igual que cualquier otra transición real de una oferta.
 */
export default defineTask<{ skipped: true; reason: string } | { expiredCount: number }>({
  meta: {
    name: 'offers:expire',
    description: 'Marca como expiradas las ofertas activas cuya fecha de expiración ya pasó',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })

    const nowTs = now()
    const due = await db
      .select({ id: schema.offers.id, organizationId: schema.offers.organizationId })
      .from(schema.offers)
      .where(and(inArray(schema.offers.status, ['submitted', 'countered']), isNotNull(schema.offers.expiration), lt(schema.offers.expiration, nowTs)))

    let expiredCount = 0
    for (const row of due) {
      try {
        await expireOffer(db, row.organizationId, row.id)
        expiredCount++
      } catch {
        // Cambió de estado entre el SELECT y aquí (p.ej. se aceptó mientras tanto) — no es una expiración real, se salta sin tumbar el resto del lote.
      }
    }

    return { result: { expiredCount } }
  },
})

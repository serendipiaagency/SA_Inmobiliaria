import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, gte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { sendTransactionalEmail } from '../../utils/email/send'
import { buildPublicSearch } from '../../utils/properties/publicSearch'
import { organizationCurrency } from '../../utils/currency'
import { formatMoney } from '../../../utils/currency'

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Runs hourly. For each active saved search, looks for real developer
 * properties created since the last check that match the saved search —
 * every filter of the public catalog, through the same Property Search module
 * (server/utils/properties/publicSearch.ts), so an alert can't disagree with
 * what the catalog shows for the same URL.
 * Emails via the same honest Resend adapter used for appointment
 * notifications — reports "not connected" rather than a fake send when
 * RESEND_API_KEY isn't set.
 */
export default defineTask<{ skipped: true; reason: string } | { checked: number; emailsSent: number }>({
  meta: {
    name: 'marketing:saved-search-alerts',
    description: 'Emails saved-search subscribers when a new matching property appears',
  },
  async run({ context }) {
    const env = (context as any)?.cloudflare?.env
    if (!env?.DB) return { result: { skipped: true, reason: 'No DB binding in task context' } }
    const db = drizzle(env.DB as D1Database, { schema })
    const now = new Date()

    const searches = await db.select().from(schema.savedSearches).where(eq(schema.savedSearches.active, 1))
    let checked = 0
    let emailsSent = 0

    for (const search of searches) {
      checked++
      let filters: Record<string, any>
      try {
        filters = JSON.parse(search.filtersJson || '{}')
      } catch {
        continue
      }

      const since = search.lastNotifiedAt || fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      // Exactamente la búsqueda que la persona guardó, con el mismo motor que
      // el catálogo (server/utils/properties/publicSearch.ts): ubicaciones,
      // operación, tipos, estado, características, precio… sólo de su agencia,
      // nada de la papelera, y sólo lo publicado desde el último aviso. Una
      // búsqueda guardada mal formada (p. ej. un radio inválido) se salta:
      // nunca avisa de lo que no pidió.
      let built: Awaited<ReturnType<typeof buildPublicSearch>>
      try {
        built = await buildPublicSearch(db, search.organizationId, filters)
      } catch {
        continue
      }
      const matches = await db
        .select()
        .from(schema.developerProperties)
        .where(and(...built.conds, gte(schema.developerProperties.createdAt, since)))
        .orderBy(desc(schema.developerProperties.id))
        .limit(50)

      if (matches.length) {
        const org = (await db.select({ domain: schema.organizations.domain }).from(schema.organizations).where(eq(schema.organizations.id, search.organizationId)).limit(1))[0]
        const origin = org?.domain ? `https://${org.domain}` : 'https://sa-inmobiliaria.com'
        // El precio, en la moneda de la agencia (utils/currency.ts) — antes «€» fijo.
        const currency = await organizationCurrency(db, search.organizationId)
        const items = matches
          .slice(0, 10)
          .map((p) => `${p.name}${p.community ? ` — ${p.community}` : ''}${p.price ? ` — ${formatMoney(p.price, currency)}` : ''}`)
        const [result] = await sendTransactionalEmail(db, env, {
          organizationId: search.organizationId,
          template: 'saved_search_alert',
          to: search.email,
          data: { count: matches.length, items },
          unsubscribeUrl: `${origin}/unsub/${search.unsubscribeToken}`,
        })
        if (result?.ok) emailsSent++
      }

      await db.update(schema.savedSearches).set({ lastNotifiedAt: fmt(now) }).where(eq(schema.savedSearches.id, search.id))
    }

    return { result: { checked, emailsSent } }
  },
})

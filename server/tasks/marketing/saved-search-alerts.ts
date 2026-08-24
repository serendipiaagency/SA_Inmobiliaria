import { drizzle } from 'drizzle-orm/d1'
import { and, eq, gte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { sendEmail } from '../../utils/email'

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Runs hourly. For each active saved search, looks for real developer
 * properties created since the last check that match a practical subset of
 * the saved filters (community, property type, price range, min bedrooms —
 * the most common ones a buyer actually filters by; this is not full parity
 * with every advanced filter on the search page, and doesn't pretend to be).
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
      let filters: Record<string, any> = {}
      try {
        filters = JSON.parse(search.filtersJson || '{}')
      } catch {
        continue
      }

      const since = search.lastNotifiedAt || fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      const conds = [eq(schema.developerProperties.organizationId, search.organizationId), gte(schema.developerProperties.createdAt, since)]
      if (filters.community) conds.push(eq(schema.developerProperties.community, String(filters.community)))
      if (filters.type) conds.push(eq(schema.developerProperties.propertyType, String(filters.type)))

      const candidates = await db
        .select()
        .from(schema.developerProperties)
        .where(and(...conds))

      const matches = candidates.filter((p) => {
        if (filters.minPrice && (p.price == null || p.price < Number(filters.minPrice))) return false
        if (filters.maxPrice && (p.price == null || p.price > Number(filters.maxPrice))) return false
        if (filters.bedrooms && (p.bedrooms == null || p.bedrooms < Number(filters.bedrooms))) return false
        return true
      })

      if (matches.length) {
        const org = (await db.select({ domain: schema.organizations.domain }).from(schema.organizations).where(eq(schema.organizations.id, search.organizationId)).limit(1))[0]
        const origin = org?.domain ? `https://${org.domain}` : 'https://sa-inmobiliaria.com'
        const list = matches
          .slice(0, 10)
          .map((p) => `<li>${p.name}${p.community ? ` — ${p.community}` : ''}${p.price ? ` — ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(p.price)}` : ''}</li>`)
          .join('')
        const result = await sendEmail(env, {
          to: search.email,
          subject: `${matches.length} propiedad${matches.length > 1 ? 'es' : ''} nueva${matches.length > 1 ? 's' : ''} que coincide${matches.length > 1 ? 'n' : ''} con tu búsqueda`,
          html: `<p>Hola,</p><p>Han aparecido ${matches.length} propiedades nuevas que coinciden con tu búsqueda guardada:</p><ul>${list}</ul><p style="color:#888;font-size:12px">Si no quieres recibir más avisos, <a href="${origin}/unsub/${search.unsubscribeToken}">cancela aquí</a>.</p>`,
        })
        if (result.ok) emailsSent++
      }

      await db.update(schema.savedSearches).set({ lastNotifiedAt: fmt(now) }).where(eq(schema.savedSearches.id, search.id))
    }

    return { result: { checked, emailsSent } }
  },
})

import { drizzle } from 'drizzle-orm/d1'
import { and, eq, gte, like, or, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { sendTransactionalEmail } from '../../utils/email/send'
import { livePropertyCond } from '../../utils/properties/trash'
import { geoConds, publicCoordsSql } from '../../utils/properties/geoSearch'
import { GeoFilterError, parseGeoQuery } from '../../../utils/maps/geo'
import { normalizePostalCode } from '../../../utils/publicSearch'
import { organizationCurrency } from '../../utils/currency'
import { formatMoney } from '../../../utils/currency'

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Runs hourly. For each active saved search, looks for real developer
 * properties created since the last check that match a practical subset of
 * the saved filters (community, municipality, neighbourhood, código postal,
 * radio alrededor de un punto, property type, price range, min bedrooms —
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
      // Una alerta nunca avisa de una propiedad que ya está en la papelera.
      const conds = [eq(schema.developerProperties.organizationId, search.organizationId), gte(schema.developerProperties.createdAt, since), livePropertyCond(schema.developerProperties)]
      if (filters.community) conds.push(eq(schema.developerProperties.community, String(filters.community)))
      if (filters.type) conds.push(eq(schema.developerProperties.propertyType, String(filters.type)))
      const P = schema.developerProperties
      // Código postal y radio (FASE 2), con la misma regla que el buscador
      // público: CP por prefijo, y el radio sobre las coordenadas que se
      // publican. Un radio guardado mal formado no amplía la búsqueda a
      // todo: esa alerta se salta (nunca avisa de lo que no pidió).
      const postalCode = normalizePostalCode(filters.postalCode)
      if (postalCode) conds.push(like(P.postalCode, `${postalCode}%`))
      try {
        const coords = publicCoordsSql(P)
        conds.push(...geoConds(coords.lat, coords.lng, parseGeoQuery({ lat: filters.lat, lng: filters.lng, radiusKm: filters.radiusKm })))
      } catch (e) {
        if (e instanceof GeoFilterError) continue
        throw e
      }
      // Municipio y barrio, con la misma regla que el buscador público
      // (server/api/public/properties.get.ts): la columna de la ficha o la de
      // la ficha ampliada.
      if (filters.municipality) {
        const v = `%${String(filters.municipality)}%`
        conds.push(or(like(P.city, v), sql`exists (select 1 from property_details pd where pd.organization_id = ${P.organizationId} and pd.property_kind = 'developer' and pd.property_id = ${P.id} and pd.municipality like ${v})`)!)
      }
      if (filters.neighborhood) {
        const v = `%${String(filters.neighborhood)}%`
        conds.push(or(like(P.community, v), sql`exists (select 1 from property_details pd where pd.organization_id = ${P.organizationId} and pd.property_kind = 'developer' and pd.property_id = ${P.id} and pd.neighborhood like ${v})`)!)
      }

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

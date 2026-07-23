import { and, eq, like, or, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

/**
 * Autocomplete for the smart search box.
 * Returns grouped suggestions: cities, neighbourhoods (communities), streets,
 * postal codes and references (project name or slug). Fast LIKE lookups,
 * capped per group. Postal codes only surface for listings that actually
 * have one — most UAE communities don't use a postal/ZIP system, so that
 * group simply stays empty until a listing in a market that does gets one.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 1) {
    // Popular defaults when empty
    const [cities, communities] = await Promise.all([
      db.select({ name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, orgId)).limit(6),
      db.select({ name: schema.communities.name }).from(schema.communities).where(eq(schema.communities.organizationId, orgId)).limit(6),
    ])
    return {
      groups: [
        { type: 'city', label: 'Ciudades', items: cities.map((c) => c.name) },
        { type: 'neighbourhood', label: 'Barrios', items: communities.map((c) => c.name) },
      ],
    }
  }

  const pat = `%${q}%`
  const P = schema.developerProperties
  const orgCond = eq(P.organizationId, orgId)
  const [cities, communities, streets, postalCodes, refsByName, refsBySlug] = await Promise.all([
    db.select({ name: schema.locations.name }).from(schema.locations).where(and(eq(schema.locations.organizationId, orgId), like(schema.locations.name, pat))).limit(5),
    db
      .select({ name: schema.communities.name })
      .from(schema.communities)
      .where(and(eq(schema.communities.organizationId, orgId), like(schema.communities.name, pat)))
      .limit(5),
    db
      .select({ street: P.street })
      .from(P)
      .where(and(orgCond, sql`${P.street} is not null and ${P.street} like ${pat}`))
      .groupBy(P.street)
      .limit(6),
    db
      .select({ postalCode: P.postalCode })
      .from(P)
      .where(and(orgCond, sql`${P.postalCode} is not null and ${P.postalCode} like ${pat}`))
      .groupBy(P.postalCode)
      .limit(6),
    db.select({ name: P.name, slug: P.slug }).from(P).where(and(orgCond, like(P.name, pat))).limit(6),
    db.select({ name: P.name, slug: P.slug }).from(P).where(and(orgCond, like(P.slug, pat))).limit(6),
  ])

  const refMap = new Map<string, { name: string; slug: string | null }>()
  for (const r of [...refsByName, ...refsBySlug]) if (r.slug) refMap.set(r.slug, r)

  const groups = [
    { type: 'city', label: 'Ciudades', items: cities.map((c) => c.name) },
    {
      type: 'neighbourhood',
      label: 'Barrios y zonas',
      items: [...new Set(communities.map((c) => c.name).filter(Boolean))].slice(0, 6),
    },
    {
      type: 'street',
      label: 'Calles',
      items: [...new Set(streets.map((s) => s.street).filter(Boolean))].slice(0, 6),
    },
    {
      type: 'postal_code',
      label: 'Código postal',
      items: [...new Set(postalCodes.map((p) => p.postalCode).filter(Boolean))].slice(0, 6),
    },
    {
      type: 'reference',
      label: 'Propiedades',
      items: [...refMap.values()].slice(0, 6),
    },
  ].filter((g) => g.items.length)

  return { groups }
})

import { like, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

/**
 * Autocomplete for the smart search box.
 * Returns grouped suggestions: cities/zones, neighbourhoods (communities),
 * and references (project names). Fast LIKE lookups, capped per group.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 1) {
    // Popular defaults when empty
    const [cities, communities] = await Promise.all([
      db.select({ name: schema.locations.name }).from(schema.locations).limit(6),
      db.select({ name: schema.communities.name }).from(schema.communities).limit(6),
    ])
    return {
      groups: [
        { type: 'city', label: 'Ciudades', items: cities.map((c) => c.name) },
        { type: 'neighbourhood', label: 'Barrios', items: communities.map((c) => c.name) },
      ],
    }
  }

  const pat = `%${q}%`
  const [cities, communities, refs, streets] = await Promise.all([
    db.select({ name: schema.locations.name }).from(schema.locations).where(like(schema.locations.name, pat)).limit(5),
    db
      .select({ name: schema.communities.name })
      .from(schema.communities)
      .where(like(schema.communities.name, pat))
      .limit(5),
    db
      .select({ name: schema.developerProperties.name, slug: schema.developerProperties.slug })
      .from(schema.developerProperties)
      .where(like(schema.developerProperties.name, pat))
      .limit(6),
    // "streets": distinct community values on projects that look like an address
    db
      .select({ name: schema.developerProperties.community })
      .from(schema.developerProperties)
      .where(like(schema.developerProperties.community, pat))
      .groupBy(schema.developerProperties.community)
      .limit(4),
  ])

  const groups = [
    { type: 'city', label: 'Ciudades', items: cities.map((c) => c.name) },
    {
      type: 'neighbourhood',
      label: 'Barrios y zonas',
      items: [...new Set([...communities.map((c) => c.name), ...streets.map((s) => s.name)].filter(Boolean))].slice(
        0,
        6,
      ),
    },
    {
      type: 'reference',
      label: 'Propiedades',
      items: refs.map((r) => ({ name: r.name, slug: r.slug })),
    },
  ].filter((g) => g.items.length)

  return { groups }
})

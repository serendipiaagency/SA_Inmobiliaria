import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { POI_TAG_FILTERS, overpassAroundQuery, queryOverpass, distanceMeters } from '../../../../utils/pois'

const RADIUS_METERS = 2000

/**
 * Real "life around this property" summary: counts and nearest example per
 * category, sourced live from OpenStreetMap within a fixed radius of the
 * property's real coordinates. A property with no coordinates simply has no
 * lifestyle data — never a fabricated stand-in.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db
    .select({ lat: schema.developerProperties.lat, lng: schema.developerProperties.lng })
    .from(schema.developerProperties)
    .where(eq(schema.developerProperties.slug, slug))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!project.lat || !project.lng) return { categories: [] }

  const types = Object.keys(POI_TAG_FILTERS)
  const pois = await queryOverpass(overpassAroundQuery(types, RADIUS_METERS, project.lat, project.lng))

  const categories = types
    .map((type) => {
      const matches = pois
        .filter((p) => p.type === type)
        .map((p) => ({ ...p, distance: distanceMeters(project.lat!, project.lng!, p.lat, p.lng) }))
        .sort((a, b) => a.distance - b.distance)
      if (!matches.length) return null
      return { type, count: matches.length, nearestName: matches[0].name, nearestDistance: Math.round(matches[0].distance) }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  return { categories }
})

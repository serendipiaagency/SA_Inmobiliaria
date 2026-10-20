import { useDb, resolvePublicOrgId } from '../../../../utils/db'
import { findPublicPropertyBySlug } from '../../../../utils/properties/publicDetail'
import { POI_TAG_FILTERS, overpassAroundQuery, queryOverpass, distanceMeters } from '../../../../utils/pois'
import { hasValidCoords } from '../../../../../utils/maps/coords'

const RADIUS_METERS = 2000

/**
 * Real "life around this property" summary: counts and nearest example per
 * category, sourced live from OpenStreetMap within a fixed radius of the
 * property's real coordinates. A property with no coordinates simply has no
 * lifestyle data — never a fabricated stand-in. El entorno sale sólo de las
 * coordenadas, así que vale igual para los dos catálogos (obra nueva y 2ª mano).
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const found = await findPublicPropertyBySlug(db, resolvePublicOrgId(event), slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const project = found.project as { lat: number | null; lng: number | null }
  // typeof-check (no `!lat || !lng`): esa versión descartaba en silencio una
  // propiedad real en el ecuador o el meridiano de Greenwich (0 es falsy).
  if (!hasValidCoords(project)) return { categories: [] }

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

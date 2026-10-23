import { useDb, resolvePublicOrgId } from '../../../../utils/db'
import { findPublicPropertyBySlug } from '../../../../utils/properties/publicDetail'
import { POI_TAG_FILTERS, overpassAroundQuery, queryOverpass, distanceMeters } from '../../../../utils/pois'
import { hasValidCoords } from '../../../../../utils/maps/coords'

const RADIUS_METERS = 2000

// El entorno de una propiedad no cambia de un minuto a otro, y Overpass limita
// por IP: cachear el resultado una semana evita volver a consultarlo en cada
// visita a la ficha (lo que disparaba los límites y dejaba el bloque sin
// datos). Sólo se cachea un resultado REAL (con datos); nunca una respuesta
// vacía —que casi siempre es un fallo transitorio de Overpass— para que no se
// congele un «sin datos» durante días: la próxima visita lo reintenta.
const LIFESTYLE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

/** Cache de Workers (`caches.default`), si existe. En Node (tests) no la hay: se omite sin más. */
function workerCache(): Cache | null {
  const c = (globalThis as any).caches
  return c && typeof c.default?.match === 'function' ? (c.default as Cache) : null
}
function lifestyleCacheKey(orgId: number, slug: string): Request {
  // Clave sintética por agencia + propiedad; el host es ficticio (sólo se usa como clave).
  return new Request(`https://lifestyle.cache.internal/${orgId}/${encodeURIComponent(slug)}`)
}

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

  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const found = await findPublicPropertyBySlug(db, orgId, slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const project = found.project as { lat: number | null; lng: number | null }
  // typeof-check (no `!lat || !lng`): esa versión descartaba en silencio una
  // propiedad real en el ecuador o el meridiano de Greenwich (0 es falsy).
  if (!hasValidCoords(project)) return { categories: [] }

  // Resultado cacheado (si lo hay): el entorno es estable, así nos ahorramos
  // reconsultar Overpass en cada visita.
  const cache = workerCache()
  const cacheKey = cache ? lifestyleCacheKey(orgId, slug) : null
  if (cache && cacheKey) {
    try {
      const hit = await cache.match(cacheKey)
      if (hit) return await hit.json()
    } catch {
      // Un fallo leyendo la cache nunca debe tumbar la petición: seguimos y consultamos.
    }
  }

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

  const result = { categories }

  // Sólo cacheamos un resultado con datos reales: una respuesta vacía suele ser
  // un fallo transitorio de Overpass, y no queremos fijarla durante una semana.
  if (cache && cacheKey && categories.length) {
    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json', 'cache-control': `max-age=${LIFESTYLE_CACHE_TTL_SECONDS}` },
        }),
      )
    } catch {
      // Si no se puede cachear, da igual: el resultado ya se devuelve igualmente.
    }
  }

  return result
})

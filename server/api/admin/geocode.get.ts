import { requireOrgScope } from '../../utils/auth'

/**
 * Forward-geocoding proxy for the Property Builder's location map: turns a
 * partial address into candidate lat/lng pairs the admin can then fine-tune
 * by dragging the marker (see components/property-builder/LocationPicker.client.vue).
 *
 * Uses OpenStreetMap's Nominatim — the same map data source (OSM/CARTO
 * tiles) this project already renders via Leaflet, so no second map/geo
 * provider or API key gets introduced. Nominatim's usage policy requires a
 * descriptive User-Agent and no client-side hammering, so this always goes
 * through the server rather than being called directly from the browser.
 */
export default defineEventHandler(async (event) => {
  await requireOrgScope(event)
  const query = getQuery(event)
  const q = [query.street, query.streetNumber, query.postalCode, query.city, query.country]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ')
  if (!q) return { results: [] }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'SA-Inmobiliaria/1.0 (admin location picker)' } })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'No se pudo contactar con el servicio de geocodificación.' })
  }
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: 'El servicio de geocodificación no respondió correctamente.' })

  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return {
    results: rows.map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name })),
  }
})

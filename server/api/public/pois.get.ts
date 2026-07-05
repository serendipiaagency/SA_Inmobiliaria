import { POI_TAG_FILTERS, overpassBboxQuery, queryOverpass } from '../../utils/pois'

/**
 * Real nearby points of interest for the map's amenity layers, sourced live
 * from OpenStreetMap (Overpass API) for the requested viewport — never
 * fabricated positions or distances.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const bbox = String(query.bbox || '')
  const types = String(query.types || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => POI_TAG_FILTERS[t])

  const [south, west, north, east] = bbox.split(',').map(Number)
  if (![south, west, north, east].every((v) => Number.isFinite(v)) || !types.length) {
    return { pois: [] }
  }

  const pois = await queryOverpass(overpassBboxQuery(types, south, west, north, east))
  return { pois }
})

/**
 * Shared helper for querying real points of interest from OpenStreetMap
 * (Overpass API) — used by the map's amenity layers and the lifestyle
 * block on the property page. Never fabricates a position, name or
 * distance; every result here traces back to a real OSM node.
 */
export const POI_TAG_FILTERS: Record<string, string[]> = {
  transporte: ['railway=station', 'public_transport=station', 'highway=bus_stop'],
  colegios: ['amenity=school'],
  hospitales: ['amenity=hospital'],
  super: ['shop=supermarket'],
  playas: ['natural=beach'],
}

export interface RawPoi {
  id: number
  name: string
  lat: number
  lng: number
  type: string
}

function poiType(tags: Record<string, string>): string {
  return Object.keys(POI_TAG_FILTERS).find((k) => POI_TAG_FILTERS[k].some((tag) => tags[tag.split('=')[0]] === tag.split('=')[1])) || 'otro'
}

export async function queryOverpass(ql: string): Promise<RawPoi[]> {
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(ql)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) return []
    const data: any = await res.json()
    return (data.elements || [])
      .filter((el: any) => el.lat && el.lon && el.tags?.name)
      .map((el: any) => ({ id: el.id, name: el.tags.name, lat: el.lat, lng: el.lon, type: poiType(el.tags) }))
  } catch {
    return []
  }
}

export function overpassBboxQuery(types: string[], south: number, west: number, north: number, east: number): string {
  const clauses = types.flatMap((t) => (POI_TAG_FILTERS[t] || []).map((tag) => `node[${tag.replace('=', '="')}"](${south},${west},${north},${east});`))
  return `[out:json][timeout:10];(${clauses.join('')});out center 60;`
}

export function overpassAroundQuery(types: string[], radiusMeters: number, lat: number, lng: number): string {
  const clauses = types.flatMap((t) => (POI_TAG_FILTERS[t] || []).map((tag) => `node[${tag.replace('=', '="')}"](around:${radiusMeters},${lat},${lng});`))
  return `[out:json][timeout:10];(${clauses.join('')});out center 100;`
}

/** Real straight-line distance in meters between two coordinates (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Real nearby points of interest for the map's amenity layers, sourced live
 * from OpenStreetMap (Overpass API) for the requested viewport — never
 * fabricated positions or distances.
 */
const TAG_FILTERS: Record<string, string[]> = {
  transporte: ['railway=station', 'public_transport=station', 'highway=bus_stop'],
  colegios: ['amenity=school'],
  hospitales: ['amenity=hospital'],
  super: ['shop=supermarket'],
  playas: ['natural=beach'],
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const bbox = String(query.bbox || '')
  const types = String(query.types || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => TAG_FILTERS[t])

  const [south, west, north, east] = bbox.split(',').map(Number)
  if (![south, west, north, east].every((v) => Number.isFinite(v)) || !types.length) {
    return { pois: [] }
  }

  const clauses = types.flatMap((t) => TAG_FILTERS[t].map((tag) => `node[${tag.replace('=', '="')}"](${south},${west},${north},${east});`))
  const ql = `[out:json][timeout:10];(${clauses.join('')});out center 60;`

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(ql)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok) return { pois: [] }
    const data: any = await res.json()
    const pois = (data.elements || [])
      .filter((el: any) => el.lat && el.lon && el.tags?.name)
      .map((el: any) => ({
        id: el.id,
        name: el.tags.name,
        lat: el.lat,
        lng: el.lon,
        type: Object.keys(TAG_FILTERS).find((k) => TAG_FILTERS[k].some((tag) => el.tags[tag.split('=')[0]] === tag.split('=')[1])) || 'otro',
      }))
    return { pois }
  } catch {
    return { pois: [] }
  }
})

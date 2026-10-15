import type { LocationKind } from '../searchState'

/**
 * «Seleccionar áreas en el mapa» (Parte II del buscador): los municipios,
 * barrios y zonas donde la agencia tiene propiedades, pintados sobre el mapa
 * como etiquetas pulsables con su número. Salen de las sugerencias sin texto
 * de /api/public/location-suggest (entidades reales del catálogo, con id y
 * coordenadas, o zonas de la agencia). No se pintan límites administrativos:
 * el catálogo trae puntos, no polígonos, y un contorno inventado engañaría.
 */
export interface MapArea {
  id: string
  kind: LocationKind
  value: string
  context: string | null
  count: number
  lat: number
  lng: number
}

interface SuggestionLike {
  id?: string | null
  kind: LocationKind
  value: string
  context?: string | null
  count?: number | null
  lat?: number
  lng?: number
}

/** Las áreas que se pueden pintar: con id, coordenadas y propiedades; sin repetir; como mucho `limit`. */
export function mapAreasFromSuggestions(items: SuggestionLike[], limit = 24): MapArea[] {
  const out: MapArea[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!it.id || seen.has(it.id)) continue
    if (typeof it.lat !== 'number' || typeof it.lng !== 'number' || !Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue
    if (!(Number(it.count) > 0)) continue
    if (it.kind !== 'municipality' && it.kind !== 'neighborhood' && it.kind !== 'zone') continue
    seen.add(it.id)
    out.push({ id: it.id, kind: it.kind, value: it.value, context: it.context ?? null, count: Number(it.count), lat: it.lat, lng: it.lng })
    if (out.length >= limit) break
  }
  return out
}

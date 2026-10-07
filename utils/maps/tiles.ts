/**
 * Capas base de todos los mapas (docs/maps.md): de dónde salen las teselas y
 * con qué atribución. Sin Leaflet ni navegador a propósito: la importa el
 * plugin que lleva la clave del servidor al cliente (plugins/map-tiles.ts),
 * que no debe arrastrar Leaflet al bundle de entrada, y se prueba sin DOM.
 *
 * Desde el 25-sep-2026 CARTO sólo sirve sus mapas base con clave: sin ella
 * devuelve 200 con una tesela que dice «API KEY REQUIRED» en vez del mapa
 * (carto.com/basemaps/apikey). La clave es pública por naturaleza (viaja en
 * cada URL de tesela) y gratuita para uso comercial hasta 1M de teselas al
 * mes. Por eso:
 *
 * - con `CARTO_BASEMAPS_KEY` configurada, los mapas son los de siempre
 *   (Positron claro y Dark Matter oscuro de CARTO);
 * - sin ella, OpenStreetMap: un mapa real y con su atribución, nunca la
 *   tesela de aviso. El oscuro es el mismo mapa invertido por CSS
 *   (`.pi-tiles-dark`, assets/css/main.css).
 *
 * El satélite (Esri World Imagery) no depende de CARTO y no cambia.
 */

export type TileKey = 'light' | 'dark' | 'satellite'

export interface TileSpec {
  url: string
  options: {
    maxZoom: number
    attribution: string
    subdomains?: string
    className?: string
  }
}

export interface MapTilesConfig {
  /** Clave de CARTO Basemaps; vacía = OpenStreetMap. */
  cartoKey: string
}

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`

/** Orígenes de las teselas, para la CSP (`img-src`) — server/middleware/security-headers.ts. */
export const TILE_ORIGINS = ['https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com', 'https://tile.openstreetmap.org', 'https://server.arcgisonline.com'] as const

/** Una clave de CARTO: sólo caracteres seguros en una URL. Cualquier otra cosa se trata como «sin clave». */
export function normalizeCartoKey(raw: unknown): string {
  const key = typeof raw === 'string' ? raw.trim() : ''
  return /^[A-Za-z0-9._~-]{8,256}$/.test(key) ? key : ''
}

export function tileSpec(key: TileKey, config: MapTilesConfig): TileSpec {
  if (key === 'satellite') {
    return { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', options: { maxZoom: 19, attribution: 'Esri' } }
  }
  const cartoKey = normalizeCartoKey(config.cartoKey)
  if (cartoKey) {
    const style = key === 'dark' ? 'dark_all' : 'light_all'
    return {
      url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      options: { maxZoom: 20, subdomains: 'abcd', attribution: CARTO_ATTRIBUTION },
    }
  }
  // Política de uso de OpenStreetMap (operations.osmfoundation.org/policies/tiles):
  // esta URL exacta, sin subdominios, atribución visible y el Referer que ya
  // manda el navegador (Referrer-Policy: strict-origin-when-cross-origin).
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: OSM_ATTRIBUTION, ...(key === 'dark' ? { className: 'pi-tiles-dark' } : {}) },
  }
}

// La configuración del cliente: la fija plugins/map-tiles.ts al arrancar, con
// la clave que el servidor puso en el payload.
let current: MapTilesConfig = { cartoKey: '' }

export function configureMapTiles(config: MapTilesConfig) {
  current = { cartoKey: normalizeCartoKey(config.cartoKey) }
}

export function mapTilesConfig(): MapTilesConfig {
  return current
}

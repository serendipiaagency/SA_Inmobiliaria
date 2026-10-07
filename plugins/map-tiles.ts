import { configureMapTiles, normalizeCartoKey } from '~/utils/maps/tiles'

/**
 * Lleva la clave de CARTO (`CARTO_BASEMAPS_KEY`, variable del Worker) del
 * servidor al cliente, donde se piden las teselas (utils/maps/tiles.ts). Va
 * en el payload de la página: es una clave pública, que de todas formas viaja
 * en cada URL de tesela. Sin clave, los mapas usan OpenStreetMap.
 *
 * Sólo importa utils/maps/tiles.ts, no Leaflet: esto corre en todas las
 * páginas y Leaflet sólo debe cargarse donde hay un mapa.
 */
export default defineNuxtPlugin(() => {
  const key = useState<string>('carto-basemaps-key', () => {
    if (!import.meta.server) return ''
    const env = (useRequestEvent()?.context as any)?.cloudflare?.env
    return normalizeCartoKey(env?.CARTO_BASEMAPS_KEY)
  })
  if (import.meta.client) configureMapTiles({ cartoKey: key.value })
})

import { useDb, resolvePublicOrgId } from '../../utils/db'
import { suggestLocationsFor } from '../../utils/geo/suggest'
import { geoSource, loadGeoCatalog } from '../../utils/geo/catalog'
import { firstString, listParam, locationKindOfId } from '../../../utils/searchState'
import { SEARCH_FEATURED_MAX } from '../../../utils/searchConfig'
import { rateLimit } from '../../utils/rateLimit'

/**
 * GET /api/public/location-suggest?q=ovie — sugerencias del campo «Ubicación»
 * (Hero y panel de Propiedades): entidades reales del catálogo geográfico de
 * España (comunidades, provincias, municipios, barrios y localidades, códigos
 * postales; GeoNames, CC-BY 4.0) con su id canónico, fundidas con el
 * inventario de ESTA agencia (cuántas propiedades hay en cada sitio; calles y
 * nombres que sólo existen en sus fichas) y con sus zonas publicadas. Sin
 * tildes ni mayúsculas, por prefijo, por texto parcial y con tolerancia a
 * errores; ranking determinista. Sin `q`, lo útil para empezar (destacadas,
 * lo que más inventario tiene, zonas). Nada de otras agencias ni inventado.
 */
export default defineEventHandler(async (event) => {
  // Protección frente a abuso: un visitante escribe decenas de letras, no cientos de consultas por minuto.
  await rateLimit(event, 'location-suggest', { limit: 400, windowSeconds: 300 })
  const q = firstString(getQuery(event).q).slice(0, 80)
  const limit = Math.max(1, Math.min(Number(firstString(getQuery(event).limit)) || 14, 30))
  // Destacadas por la agencia (Constructor): salen primero con el campo vacío; no limitan la búsqueda, sólo reordenan.
  const featured = listParam(getQuery(event).featured, 20)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((id) => !!locationKindOfId(id))
    .slice(0, SEARCH_FEATURED_MAX)
  await loadGeoCatalog()
  const items = await suggestLocationsFor(useDb(event), resolvePublicOrgId(event), q, { limit, featured })
  setHeader(event, 'Cache-Control', 'private, max-age=30')
  return { q, items, source: geoSource() }
})

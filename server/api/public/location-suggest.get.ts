import { useDb, resolvePublicOrgId } from '../../utils/db'
import { suggestLocationsFor } from '../../utils/geo/suggest'
import { geoSource, loadGeoCatalog } from '../../utils/geo/catalog'
import { firstString } from '../../../utils/searchState'
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
  await loadGeoCatalog()
  const items = await suggestLocationsFor(useDb(event), resolvePublicOrgId(event), q, { limit })
  setHeader(event, 'Cache-Control', 'private, max-age=30')
  return { q, items, source: geoSource() }
})

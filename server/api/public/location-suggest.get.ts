import { useDb, resolvePublicOrgId } from '../../utils/db'
import { locationIndex, suggestLocations } from '../../utils/properties/locationIndex'
import { firstString } from '../../../utils/searchState'

/**
 * GET /api/public/location-suggest?q=ovie — sugerencias del campo «Ubicación»
 * (Hero y panel de Propiedades): provincias, municipios, barrios y zonas,
 * códigos postales y calles que tienen propiedades publicadas en ESTA agencia,
 * con su contexto («Municipio · Asturias») y cuántas hay. Sin tildes ni
 * mayúsculas y por coincidencia parcial. Sin `q`, las zonas con más
 * propiedades. Nada de otras agencias ni de la papelera; nada inventado.
 */
export default defineEventHandler(async (event) => {
  const q = firstString(getQuery(event).q).slice(0, 80)
  const entries = await locationIndex(useDb(event), resolvePublicOrgId(event))
  const items = suggestLocations(entries, q).map((e) => ({ kind: e.kind, value: e.value, context: e.context, count: e.count }))
  setHeader(event, 'Cache-Control', 'private, max-age=30')
  return { q, items }
})

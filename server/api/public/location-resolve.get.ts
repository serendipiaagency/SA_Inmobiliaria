import { useDb, resolvePublicOrgId } from '../../utils/db'
import { resolveLocationIds } from '../../utils/geo/locations'
import { listParam } from '../../../utils/searchState'
import { rateLimit } from '../../utils/rateLimit'

/**
 * GET /api/public/location-resolve?ids=es:mun:33024,zone:12 — nombre y contexto
 * de cada ubicación elegida por identificador (para pintar los chips al llegar
 * con una URL). Las zonas sólo si son de esta agencia; los ids desconocidos
 * se omiten (nunca un error por un enlace viejo).
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'location-resolve', { limit: 200, windowSeconds: 300 })
  const ids = listParam(getQuery(event).ids, 40).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean).slice(0, 20)
  const items = await resolveLocationIds(useDb(event), resolvePublicOrgId(event), ids)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return { items }
})

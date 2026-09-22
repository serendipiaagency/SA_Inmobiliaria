import { requireOrgScope } from '../../../../../utils/auth'
import { findPropertiesForRequirement } from '../../../../../utils/matching/service'

/**
 * Necesidad → inmuebles compatibles, con el desglose que explica cada score.
 *
 * Es una lectura: calcular un match no lo persiste. Sólo se guarda cuando
 * alguien decide algo sobre él (seleccionar, descartar).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Identificador no válido' })

  const query = getQuery(event)
  const found = await findPropertiesForRequirement(event, orgId, id, {
    includeIneligible: query.includeIneligible === '1' || query.includeIneligible === 'true',
    limit: Math.min(Number(query.limit) || 50, 200),
  })
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Necesidad no encontrada' })

  return found
})

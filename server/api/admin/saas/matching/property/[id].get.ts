import { requireOrgScope } from '../../../../../utils/auth'
import { findRequirementsForProperty } from '../../../../../utils/matching/service'

/** Inmueble → compradores compatibles. Mismo motor, dirección contraria. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Identificador no válido' })

  const query = getQuery(event)
  const found = await findRequirementsForProperty(event, orgId, id, {
    includeIneligible: query.includeIneligible === '1' || query.includeIneligible === 'true',
    limit: Math.min(Number(query.limit) || 50, 200),
  })
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })

  return found
})

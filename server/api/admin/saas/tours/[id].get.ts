import { requireOrgScope } from '../../../../utils/auth'
import { tourWithStops } from '../../../../utils/appointments/outcomes'

/** Un tour con sus paradas en orden. La hora de cada parada vive en su cita. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Identificador no válido' })

  const found = await tourWithStops(event, orgId, id)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Tour no encontrado' })
  return found
})

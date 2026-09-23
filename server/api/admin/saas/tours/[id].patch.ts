import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { cancelStop, reorderTour } from '../../../../utils/appointments/outcomes'

/**
 * Reordena las paradas o cancela una.
 *
 * Reordenar sólo cambia el orden: las horas viven en las citas y no se tocan
 * aquí, para que no existan dos versiones del horario que se contradigan.
 * Cancelar una parada no cancela el tour: que un piso se caiga no anula la tarde.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Identificador no válido' })

  const body = await readBody<{ stopIds?: number[]; cancelStopId?: number; reason?: string }>(event)

  if (Number.isInteger(body?.cancelStopId)) {
    const stop = await cancelStop(event, orgId, body.cancelStopId!, body.reason)
    if (!stop) throw createError({ statusCode: 404, statusMessage: 'Parada no encontrada' })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'property_tour', resourceId: id, detail: `parada cancelada${body.reason ? `: ${body.reason}` : ''}` })
    return stop
  }

  if (Array.isArray(body?.stopIds)) {
    const result = await reorderTour(event, orgId, id, body.stopIds)
    if (!result) throw createError({ statusCode: 404, statusMessage: 'Tour no encontrado' })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'property_tour', resourceId: id, detail: 'paradas reordenadas' })
    return result
  }

  throw createError({ statusCode: 422, statusMessage: 'Indica el nuevo orden o la parada a cancelar' })
})

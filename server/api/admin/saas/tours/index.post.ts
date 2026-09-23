import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { createTour } from '../../../../utils/appointments/outcomes'
import { AppointmentError } from '../../../../utils/appointments/types'

/**
 * Crea un tour de varios inmuebles.
 *
 * El tour agrupa; cada parada reserva su tiempo con una cita propia. No se
 * guarda una lista de identificadores dentro de una única cita, porque hace
 * falta orden, hora y resultado por parada.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<any>(event)

  try {
    const tour = await createTour(event, orgId, body, { userId: user.id })
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'property_tour', resourceId: tour.id, detail: tour.title || `${body?.propertyIds?.length || 0} paradas` })
    return tour
  } catch (error) {
    if (error instanceof AppointmentError) throw createError({ statusCode: 422, statusMessage: error.message })
    throw error
  }
})

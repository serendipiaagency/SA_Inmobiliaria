import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { saveOutcome } from '../../../../utils/appointments/outcomes'
import { AppointmentError, type OutcomeInput } from '../../../../utils/appointments/types'

/**
 * Guarda qué opinó el comprador tras la visita.
 *
 * Este endpoint NO modifica el inmueble ni la necesidad del comprador: lo que
 * se recoge es percepción de una persona sobre una tarde concreta. Si "la
 * cocina está anticuada" cambiara el estado oficial del inmueble, el siguiente
 * comprador vería como hecho comprobado el mal día de otro.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<OutcomeInput & { visitId: number }>(event)
  if (!Number.isInteger(body?.visitId)) throw createError({ statusCode: 422, statusMessage: 'Falta la cita' })

  try {
    const outcome = await saveOutcome(event, orgId, body.visitId, body, { userId: user.id })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'visit', resourceId: body.visitId, detail: 'resultado de visita' })
    return outcome
  } catch (error) {
    if (error instanceof AppointmentError) {
      throw createError({ statusCode: error.message.includes('no encontrada') ? 404 : 422, statusMessage: error.message })
    }
    throw error
  }
})

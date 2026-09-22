import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { markFeaturesReviewed } from '../../../../utils/matching/service'

/**
 * Deja constancia de que alguien repasó las características del inmueble.
 *
 * Es lo que convierte un `has_pool = 0` en un "no la tiene" de verdad: hasta
 * que alguien lo confirma, ese 0 es el valor por defecto de la columna y el
 * motor lo trata como desconocido.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ propertyId: number }>(event)
  if (!Number.isInteger(body?.propertyId)) throw createError({ statusCode: 422, statusMessage: 'Falta el inmueble' })

  const row = await markFeaturesReviewed(event, orgId, body.propertyId, user.id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'property', resourceId: body.propertyId, detail: 'características revisadas' })
  return row
})

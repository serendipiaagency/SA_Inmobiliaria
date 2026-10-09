import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { adminUnsubscribe, deleteSubscription } from '../../../utils/newsletter'

/**
 * PATCH /api/admin/newsletter — `{ id, action: 'unsubscribe' }` da de baja a
 * alguien que lo pide por otra vía; `{ id, action: 'delete' }` borra su fila
 * (supresión RGPD). Nunca se vuelve a apuntar a nadie desde el panel: el alta
 * exige su consentimiento, en el formulario de la web.
 */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const body = (await readBody<{ id?: unknown; action?: unknown }>(event)) || {}
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Suscripción no válida' })
  const db = useDb(event)
  if (body.action === 'unsubscribe') {
    await adminUnsubscribe(db, orgId, id)
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'newsletter-subscriptions', resourceId: id, detail: 'baja' })
  } else if (body.action === 'delete') {
    await deleteSubscription(db, orgId, id)
    await logAdminAction(event, { user, orgId, action: 'delete', resource: 'newsletter-subscriptions', resourceId: id })
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Acción no válida' })
  }
  return { ok: true }
})

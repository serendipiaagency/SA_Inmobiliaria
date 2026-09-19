import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Rota el secreto HMAC de un endpoint saliente. Hasta ahora no había forma
 * de hacerlo sin borrar el endpoint y crearlo de nuevo (perdiendo su
 * historial de entregas), y un secreto que se ha filtrado no se puede
 * "despublicar": hay que cambiarlo.
 *
 * El secreto nuevo se devuelve una sola vez, igual que en el alta. A partir
 * de la siguiente entrega las firmas van con él; el receptor tiene que
 * actualizarlo a la vez. Consta en la auditoría como `rotate` — sin el
 * valor, ni el viejo ni el nuevo.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const row = (await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id)).limit(1))[0]
  if (!row || row.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const secret = generateSecret()
  await db.update(schema.webhookEndpoints).set({ secret }).where(eq(schema.webhookEndpoints.id, id))
  await logAdminAction(event, { user, orgId, action: 'rotate', resource: 'webhook-endpoint', resourceId: id, detail: `secreto HMAC rotado (${row.url})` })

  return { ok: true, id, secret }
})

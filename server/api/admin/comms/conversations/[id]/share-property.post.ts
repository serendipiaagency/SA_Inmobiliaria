import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, useDb } from '../../../../../utils/db'
import { serializeMessage, sharePropertyInConversation } from '../../../../../utils/comms/admin'

/**
 * POST /api/admin/comms/conversations/:id/share-property — manda la ficha de
 * una propiedad de cualquiera de los dos catálogos: con foto (si la hay y el
 * canal admite medios) y el texto como pie, o sólo texto. Sólo
 * developer-properties tiene enlace público (2ª mano no se publica en la
 * web, ver `buildPropertyShare`). Queda en el hilo como `property_share` y
 * la propiedad pasa a ser el contexto de la conversación.
 *
 * `buyerRequirementId` (FASE 29 §126-127) es opcional: cuando llega, es la
 * acción "Enviar propiedad" de Compatibilidades sobre un match ya
 * seleccionado — el envío que confirma `sendOutbound()` es lo único que
 * puede marcar ese PropertyMatch como `sent` (nunca el cliente a mano).
 *
 * La lógica vive en `sharePropertyInConversation` (server/utils/comms/admin.ts),
 * compartida con la Domain Tool send_property (FASE 31).
 *
 * Body: { propertyId: number; propertyKind?: 'agent'|'developer'; note?: string; buyerRequirementId?: number }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const body = (await readBody(event)) || {}
  const { result, share } = await sharePropertyInConversation(event, useDb(event), cfEnv(event) as Record<string, any>, orgId, user.id, Number(getRouterParam(event, 'id')), {
    propertyId: Number(body.propertyId),
    propertyKind: body.propertyKind,
    note: body.note ? String(body.note) : null,
    buyerRequirementId: body.buyerRequirementId ? Number(body.buyerRequirementId) : null,
    statusCallbackUrl: `${getRequestURL(event).origin}/api/comms/webhooks/twilio/status`,
  })
  if (!result.ok) {
    if (result.code === 'provider') {
      setResponseStatus(event, 502)
      return { ok: false, code: result.code, error: result.error, message: result.message ? serializeMessage(result.message) : null }
    }
    throw createError({ statusCode: 422, statusMessage: result.error || 'No se pudo enviar', data: { code: result.code } })
  }
  return { ok: true, message: serializeMessage(result.message!), property: { id: share.id, kind: share.kind, name: share.name, url: share.url } }
})

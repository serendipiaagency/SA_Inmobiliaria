import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../../utils/db'
import { buildPropertyShare, loadConversationForOrg, publicSiteOrigin, serializeMessage } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { sendOutbound } from '../../../../../utils/comms/inbox'
import { PROVIDERS } from '../../../../../utils/comms/providers/registry'
import { markMatchSent, PROPERTY_KINDS, type PropertyKind } from '../../../../../utils/matching/service'

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
 * Body: { propertyId: number; propertyKind?: 'agent'|'developer'; note?: string; buyerRequirementId?: number }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, id)
  const channel = await loadChannel(db, env, { id: channelRow.id, orgId })
  if (!channel || channel.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'El número de este hilo no está disponible.' })

  const body = (await readBody(event)) || {}
  const propertyId = Number(body.propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) throw createError({ statusCode: 422, statusMessage: 'Elige una propiedad.' })
  const propertyKind: PropertyKind = PROPERTY_KINDS.includes(body.propertyKind) ? body.propertyKind : 'developer'
  const share = await buildPropertyShare(db, orgId, propertyId, propertyKind, await publicSiteOrigin(db, orgId, event), body.note ? String(body.note).slice(0, 500) : null)

  const useImage = Boolean(share.imageLink) && PROVIDERS[channel.provider].capabilities.media && share.text.length <= 1024
  const result = await sendOutbound(db, {
    channel,
    env,
    conversation,
    contact,
    message: useImage ? { kind: 'image', link: share.imageLink!, caption: share.text } : { kind: 'text', body: share.text, previewUrl: Boolean(share.url) },
    displayBody: share.text,
    storeAs: 'property_share',
    propertyId: share.id,
    propertyKind,
    userId: user.id,
    statusCallbackUrl: channel.provider === 'twilio' ? `${getRequestURL(event).origin}/api/comms/webhooks/twilio/status` : null,
  })
  if (!result.ok) {
    if (result.code === 'provider') {
      setResponseStatus(event, 502)
      return { ok: false, code: result.code, error: result.error, message: result.message ? serializeMessage(result.message) : null }
    }
    throw createError({ statusCode: 422, statusMessage: result.error || 'No se pudo enviar', data: { code: result.code } })
  }
  if (conversation.propertyId !== share.id || conversation.propertyKind !== propertyKind) {
    await db.update(schema.commsConversations).set({ propertyId: share.id, propertyKind, updatedAt: now() }).where(eq(schema.commsConversations.id, conversation.id))
  }
  const buyerRequirementId = Number(body.buyerRequirementId)
  if (Number.isInteger(buyerRequirementId) && buyerRequirementId > 0) {
    await markMatchSent(event, orgId, { buyerRequirementId, propertyId: share.id, propertyKind }, { userId: user.id }).catch(() => {
      // El envío ya ocurrió de verdad (sendOutbound ya lo confirmó arriba) —
      // que el match no se pudiera marcar (p.ej. no existía ese par) no
      // deshace el mensaje ya mandado, mismo criterio que recordActivity.
    })
  }
  return { ok: true, message: serializeMessage(result.message!), property: { id: share.id, kind: share.kind, name: share.name, url: share.url } }
})

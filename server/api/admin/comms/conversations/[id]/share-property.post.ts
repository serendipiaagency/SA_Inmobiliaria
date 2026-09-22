import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../../utils/db'
import { buildPropertyShare, loadConversationForOrg, publicSiteOrigin, serializeMessage } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { sendOutbound } from '../../../../../utils/comms/inbox'
import { PROVIDERS } from '../../../../../utils/comms/providers/registry'

/**
 * POST /api/admin/comms/conversations/:id/share-property — manda la ficha de
 * una propiedad de la web: foto de portada (si la hay y el canal admite
 * medios) con el texto como pie, o sólo el texto, siempre con el enlace
 * público a /propiedades/<slug>. Queda en el hilo como `property_share` y
 * la propiedad pasa a ser el contexto de la conversación.
 *
 * Body: { propertyId: number; note?: string }
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
  const share = await buildPropertyShare(db, orgId, propertyId, await publicSiteOrigin(db, orgId, event), body.note ? String(body.note).slice(0, 500) : null)

  const useImage = Boolean(share.imageLink) && PROVIDERS[channel.provider].capabilities.media && share.text.length <= 1024
  const result = await sendOutbound(db, {
    channel,
    env,
    conversation,
    contact,
    message: useImage ? { kind: 'image', link: share.imageLink!, caption: share.text } : { kind: 'text', body: share.text, previewUrl: true },
    displayBody: share.text,
    storeAs: 'property_share',
    propertyId: share.id,
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
  if (conversation.propertyId !== share.id) {
    await db.update(schema.commsConversations).set({ propertyId: share.id, updatedAt: now() }).where(eq(schema.commsConversations.id, conversation.id))
  }
  return { ok: true, message: serializeMessage(result.message!), property: { id: share.id, name: share.name, url: share.url } }
})

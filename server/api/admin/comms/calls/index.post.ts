import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, useDb } from '../../../../utils/db'
import { loadContactForOrg, loadConversationForOrg, serializeCall } from '../../../../utils/comms/admin'
import { startOutboundCall } from '../../../../utils/comms/calls'
import { defaultChannel, loadChannel } from '../../../../utils/comms/credentials'

/**
 * POST /api/admin/comms/calls — inicia una llamada saliente por WhatsApp
 * (Meta Calling API). El navegador ya creó su RTCPeerConnection y manda la
 * oferta SDP; el servidor la pasa a Meta y devuelve la llamada en estado
 * `initiated`. La respuesta SDP llega por webhook y el navegador la recoge
 * en /api/admin/comms/calls/:id.
 *
 * Body: { conversationId?: number; contactId?: number; sdpOffer: string; propertyId?: number }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const body = (await readBody(event)) || {}
  const sdpOffer = String(body.sdpOffer || '')
  if (!sdpOffer.includes('m=audio')) throw createError({ statusCode: 422, statusMessage: 'Falta la oferta SDP de audio del navegador.' })

  let contactId: number
  let conversationId: number | null = null
  let channelId: number | null = null
  if (body.conversationId) {
    const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, Number(body.conversationId))
    contactId = contact.id
    conversationId = conversation.id
    channelId = channelRow.id
  } else if (body.contactId) {
    contactId = (await loadContactForOrg(db, orgId, Number(body.contactId))).id
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Indica conversationId o contactId.' })
  }
  const channel = channelId ? await loadChannel(db, env, { id: channelId, orgId }) : await defaultChannel(db, env, orgId)
  if (!channel) throw createError({ statusCode: 409, statusMessage: 'No hay ningún número conectado.', data: { code: 'calling_unavailable' } })

  const r = await startOutboundCall(db, env, { channel, contactId, conversationId, userId: user.id, sdpOffer, propertyId: body.propertyId ? Number(body.propertyId) : null })
  if (!r.ok) throw createError({ statusCode: r.code === 'provider' ? 502 : 409, statusMessage: r.error || 'No se pudo iniciar la llamada', data: { code: r.code } })
  return { ok: true, call: serializeCall(r.call!, { includeSession: true }) }
})

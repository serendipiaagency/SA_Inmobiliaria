import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../../utils/db'
import { loadConversationForOrg } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { serviceWindow } from '../../../../../utils/comms/inbox'
import { metaGetCallPermission, metaSendCallPermissionRequest } from '../../../../../utils/comms/providers/metaCloud'

/**
 * POST /api/admin/comms/conversations/:id/call-permission — pide al contacto
 * permiso para llamarle (mensaje interactivo call_permission_request de
 * Meta) o, con { action: 'check' }, consulta el estado actual del permiso.
 * Sólo tiene sentido en canales de Meta con llamadas activas; Meta limita
 * las peticiones a 1 por 24 h y 2 por semana por contacto.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, id)
  const channel = await loadChannel(db, env, { id: channelRow.id, orgId })
  if (!channel || channel.provider !== 'meta_cloud') throw createError({ statusCode: 409, statusMessage: 'Los permisos de llamada sólo existen en números de Meta WhatsApp Cloud API.' })
  if (channel.callingStatus !== 'enabled') throw createError({ statusCode: 409, statusMessage: 'Las llamadas no están activas en este número (Configuración → Comunicaciones → Llamadas).' })

  const body = (await readBody(event)) || {}
  const nowTs = now()
  if (body.action === 'check') {
    const state = await metaGetCallPermission(channel, env, contact.phoneE164)
    if (!state.ok) throw createError({ statusCode: 502, statusMessage: state.error || 'Meta no respondió' })
    const status = state.status === 'temporary' || state.status === 'permanent' ? state.status : 'unknown'
    await db
      .update(schema.commsContacts)
      .set({ callPermissionStatus: status, callPermissionExpiresAt: state.expiresAt ? state.expiresAt.replace('T', ' ').slice(0, 19) : null, callPermissionUpdatedAt: nowTs, updatedAt: nowTs })
      .where(eq(schema.commsContacts.id, contact.id))
    return { ok: true, status, expiresAt: state.expiresAt, canRequest: state.canRequest }
  }

  if (!serviceWindow(conversation.lastInboundAt).open) {
    throw createError({ statusCode: 422, statusMessage: 'La petición de permiso es un mensaje libre: sólo se puede enviar dentro de las 24 h siguientes al último mensaje del contacto.', data: { code: 'window_closed' } })
  }
  const text = String(body.text || `Hola, soy ${user.name} de la inmobiliaria. ¿Podemos llamarte por WhatsApp para comentar la propiedad que te interesa?`).slice(0, 1024)
  const result = await metaSendCallPermissionRequest(channel, env, contact.phoneE164, text)
  if (!result.ok) throw createError({ statusCode: 502, statusMessage: result.error || 'Meta rechazó la petición' })
  await db.insert(schema.commsMessages).values({
    organizationId: orgId,
    conversationId: conversation.id,
    direction: 'out',
    type: 'interactive',
    body: `Petición de permiso de llamada: “${text}”`,
    externalId: result.externalId,
    status: 'sent',
    sentByUserId: user.id,
    payloadJson: JSON.stringify({ interactive: { type: 'call_permission_request' } }),
    createdAt: nowTs,
    updatedAt: nowTs,
  })
  await db.update(schema.commsConversations).set({ lastMessageAt: nowTs, lastMessagePreview: 'Petición de permiso de llamada', updatedAt: nowTs }).where(eq(schema.commsConversations.id, conversation.id))
  return { ok: true, externalId: result.externalId }
})

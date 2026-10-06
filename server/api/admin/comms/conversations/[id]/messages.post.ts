import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, schema, useDb } from '../../../../../utils/db'
import { loadConversationForOrg, publicSiteOrigin, retryOutboundMessage, serializeMessage } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { renderTemplateBody, sendOutbound, templateParamCount, type SendOutboundResult } from '../../../../../utils/comms/inbox'
import { findOwnedMediaAsset } from '../../../../../utils/mediaAssets'
import type { OutboundMessage } from '../../../../../utils/comms/types'
import { loadWebThreadForOrg, parseWebThreadKey, replyToWebThread } from '../../../../../utils/comms/web'

/**
 * POST /api/admin/comms/conversations/:id/messages — enviar por el canal del hilo.
 *
 * Body (uno de):
 *   { type: 'text', body }
 *   { type: 'template', templateId, params: string[] }
 *   { type: 'image' | 'document', mediaKey, caption?, filename? }   (un archivo subido por /api/admin/upload)
 *   { type: 'retry', messageId }   (FASE 29 §136 — reenvía un saliente que quedó `failed`)
 *
 * `retry` vive aquí y no en `/messages/:id/retry` porque el margen de claves
 * de ruta de Nitro frente al TS2589 está en cero (docs/property-schema-registry.md,
 * P1-14): una ruta nueva rompe `npm run typecheck`.
 *
 * La ventana de 24 h y el consentimiento se comprueban en sendOutbound()
 * ANTES de llamar al proveedor; un rechazo llega como 422 con `code`.
 *
 * Núcleo N8a — hilos web (`:id = w<n>`, formulario o chat):
 *   { type: 'text', via: 'chat' | 'email', body, subject? }
 *   { type: 'property', via: 'chat' | 'email', propertyId, propertyKind, body? }
 * Sólo por un canal real (server/utils/comms/web.ts#webReplyOptions): sin
 * sesión de chat, sin email o sin email conectado → 409 con el motivo, nunca
 * un envío simulado. Una ficha de obra nueva a una persona conocida sale con
 * su enlace personal (aperturas del Lead Score). El envío real por email
 * pasa por email_log; un fallo del proveedor deja el mensaje como fallido (502).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const webId = parseWebThreadKey(getRouterParam(event, 'id'))
  if (webId) {
    const thread = await loadWebThreadForOrg(db, orgId, webId)
    const body = (await readBody(event)) || {}
    const type = String(body.type || 'text')
    if (type !== 'text' && type !== 'property') throw createError({ statusCode: 422, statusMessage: 'Tipo de mensaje no admitido en un hilo web (text o property).' })
    let property: { id: number; kind: 'agent' | 'developer' } | null = null
    if (type === 'property') {
      const propertyId = Number(body.propertyId)
      if (!Number.isInteger(propertyId) || propertyId <= 0) throw createError({ statusCode: 422, statusMessage: 'Elige una propiedad.' })
      property = { id: propertyId, kind: body.propertyKind === 'agent' ? 'agent' : 'developer' }
    }
    const result = await replyToWebThread(db, env, {
      orgId,
      thread,
      userId: user.id,
      // replyToWebThread rechaza (422) cualquier canal que no sea chat o email.
      via: String(body.via || '') as 'email' | 'chat',
      body: body.body ? String(body.body) : null,
      property,
      origin: await publicSiteOrigin(db, orgId, event),
      emailConnected: Boolean(env.RESEND_API_KEY),
      subject: body.subject ? String(body.subject).slice(0, 200) : null,
    })
    if (!result.ok) {
      setResponseStatus(event, 502)
      return { ok: false, code: 'provider', error: result.error, message: result.message }
    }
    return { ok: true, message: result.message }
  }
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, id)
  if (channelRow.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'El número de este hilo está desactivado.' })
  const channel = await loadChannel(db, env, { id: channelRow.id, orgId })
  if (!channel) throw createError({ statusCode: 503, statusMessage: 'No se pueden leer las credenciales del canal (COMMS_CREDENTIALS_ENCRYPTION_KEY).' })

  const body = (await readBody(event)) || {}
  const type = String(body.type || 'text')
  const statusCallbackUrl = channel.provider === 'twilio' ? `${getRequestURL(event).origin}/api/comms/webhooks/twilio/status` : null

  if (type === 'retry') {
    const rows = await db
      .select()
      .from(schema.commsMessages)
      .where(and(eq(schema.commsMessages.id, Number(body.messageId)), eq(schema.commsMessages.conversationId, conversation.id), eq(schema.commsMessages.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Mensaje no encontrado' })
    const result = await retryOutboundMessage(db, env, { channel, conversation, contact, failed: rows[0], userId: user.id, origin: await publicSiteOrigin(db, orgId, event), statusCallbackUrl })
    return respond(event, result)
  }

  let message: OutboundMessage
  let displayBody: string | null = null

  if (type === 'text') {
    const text = String(body.body || '').trim()
    if (!text) throw createError({ statusCode: 422, statusMessage: 'Escribe algo antes de enviar.' })
    if (text.length > 4096) throw createError({ statusCode: 422, statusMessage: 'WhatsApp admite hasta 4096 caracteres por mensaje.' })
    message = { kind: 'text', body: text }
  } else if (type === 'template') {
    const rows = await db
      .select()
      .from(schema.commsTemplates)
      .where(and(eq(schema.commsTemplates.id, Number(body.templateId)), eq(schema.commsTemplates.organizationId, orgId), eq(schema.commsTemplates.channelId, channel.id)))
      .limit(1)
    const template = rows[0]
    if (!template) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada en este canal' })
    if (!['approved', 'unknown'].includes(template.status)) throw createError({ statusCode: 422, statusMessage: `La plantilla está en estado "${template.status}": Meta sólo entrega plantillas aprobadas.` })
    const params = Array.isArray(body.params) ? body.params.map((p: unknown) => String(p ?? '').trim()) : []
    const needed = templateParamCount(template.body)
    if (params.length < needed || params.slice(0, needed).some((p: string) => !p)) throw createError({ statusCode: 422, statusMessage: `Esta plantilla necesita ${needed} valor${needed === 1 ? '' : 'es'}.` })
    message = { kind: 'template', name: template.name, language: template.language, params: params.slice(0, needed), contentSid: channel.provider === 'twilio' ? template.externalId : null }
    displayBody = renderTemplateBody(template.body, params)
  } else if (type === 'image' || type === 'document') {
    const mediaKey = String(body.mediaKey || '')
    if (!mediaKey) throw createError({ statusCode: 422, statusMessage: 'Falta el archivo.' })
    const asset = await findOwnedMediaAsset(db, orgId, mediaKey)
    if (!asset) throw createError({ statusCode: 404, statusMessage: 'Archivo no encontrado' })
    if (asset.visibility !== 'public') throw createError({ statusCode: 422, statusMessage: 'Sólo se pueden enviar archivos públicos: el proveedor tiene que poder descargarlos.' })
    const origin = await publicSiteOrigin(db, orgId, event)
    const caption = body.caption ? String(body.caption).slice(0, 1024) : null
    message = type === 'image' ? { kind: 'image', link: `${origin}/api/media/${mediaKey}`, caption } : { kind: 'document', link: `${origin}/api/media/${mediaKey}`, caption, filename: body.filename ? String(body.filename).slice(0, 200) : (asset.originalFilename ?? null) }
    displayBody = caption
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Tipo de mensaje no admitido' })
  }

  const result = await sendOutbound(db, { channel, env, conversation, contact, message, displayBody, userId: user.id, statusCallbackUrl })
  return respond(event, result)
})

function respond(event: H3Event, result: SendOutboundResult) {
  if (!result.ok) {
    if (result.code === 'provider') {
      setResponseStatus(event, 502)
      return { ok: false, code: result.code, error: result.error, message: result.message ? serializeMessage(result.message) : null }
    }
    throw createError({ statusCode: 422, statusMessage: result.error || 'No se pudo enviar', data: { code: result.code } })
  }
  return { ok: true, message: serializeMessage(result.message!) }
}

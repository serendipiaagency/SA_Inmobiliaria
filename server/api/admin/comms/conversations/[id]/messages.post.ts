import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, schema, useDb } from '../../../../../utils/db'
import { loadConversationForOrg, publicSiteOrigin, serializeMessage } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { renderTemplateBody, sendOutbound, templateParamCount } from '../../../../../utils/comms/inbox'
import { findOwnedMediaAsset } from '../../../../../utils/mediaAssets'
import type { OutboundMessage } from '../../../../../utils/comms/types'

/**
 * POST /api/admin/comms/conversations/:id/messages — enviar por el canal del hilo.
 *
 * Body (uno de):
 *   { type: 'text', body }
 *   { type: 'template', templateId, params: string[] }
 *   { type: 'image' | 'document', mediaKey, caption?, filename? }   (un archivo subido por /api/admin/upload)
 *
 * La ventana de 24 h y el consentimiento se comprueban en sendOutbound()
 * ANTES de llamar al proveedor; un rechazo llega como 422 con `code`.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact, channelRow } = await loadConversationForOrg(db, orgId, id)
  if (channelRow.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'El número de este hilo está desactivado.' })
  const channel = await loadChannel(db, env, { id: channelRow.id, orgId })
  if (!channel) throw createError({ statusCode: 503, statusMessage: 'No se pueden leer las credenciales del canal (COMMS_CREDENTIALS_ENCRYPTION_KEY).' })

  const body = (await readBody(event)) || {}
  const type = String(body.type || 'text')
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

  const result = await sendOutbound(db, {
    channel,
    env,
    conversation,
    contact,
    message,
    displayBody,
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
  return { ok: true, message: serializeMessage(result.message!) }
})

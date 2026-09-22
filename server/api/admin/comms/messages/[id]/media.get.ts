import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, schema, useDb } from '../../../../../utils/db'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { ensureInboundMedia } from '../../../../../utils/comms/media'

/**
 * GET /api/admin/comms/messages/:id/media — el archivo de un mensaje
 * entrante. La primera vez se descarga del proveedor con el token del canal
 * y se guarda en R2 (server/utils/comms/media.ts); después se sirve de ahí.
 * Acotado por organización: un id de otra agencia es 404.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const rows = await db
    .select()
    .from(schema.commsMessages)
    .where(and(eq(schema.commsMessages.id, id), eq(schema.commsMessages.organizationId, orgId)))
    .limit(1)
  const message = rows[0]
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let key = message.mediaKey
  let mime = message.mediaMime
  if (!key) {
    const conv = await db.select({ channelId: schema.commsConversations.channelId }).from(schema.commsConversations).where(eq(schema.commsConversations.id, message.conversationId)).limit(1)
    const channel = conv[0] ? await loadChannel(db, env, { id: conv[0].channelId, orgId }) : null
    if (!channel) throw createError({ statusCode: 503, statusMessage: 'No se pueden leer las credenciales del canal para descargar el archivo.' })
    const r = await ensureInboundMedia(db, env, channel, message)
    if (!r.ok || !r.key) throw createError({ statusCode: 502, statusMessage: r.error || 'No se pudo obtener el archivo' })
    key = r.key
    mime = r.mime
  }

  const obj = await (env.MEDIA as R2Bucket).get(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'Content-Type', mime || obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Cache-Control', 'private, no-store')
  if (message.mediaFilename && !String(mime || '').startsWith('image/') && !String(mime || '').startsWith('audio/')) {
    setHeader(event, 'Content-Disposition', `inline; filename="${message.mediaFilename.replace(/["\r\n]/g, '')}"`)
  }
  return obj.body
})

import { and, eq, ne } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { channelView, decryptChannelCredentials, encryptChannelCredentials, isCommsEncryptionAvailable } from '../../../../utils/comms/credentials'
import type { ChannelCredentials } from '../../../../utils/comms/types'

/**
 * PATCH /api/admin/comms/channels/:id — etiqueta, estado, canal por
 * defecto, id de la WABA y credenciales (sólo los campos que vengan con
 * valor sustituyen a los guardados; un campo vacío no borra nada).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  const rows = await db
    .select()
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.id, id), eq(schema.commsChannels.organizationId, orgId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  const body = (await readBody(event)) || {}
  const patch: Record<string, any> = { updatedAt: now() }

  if ('label' in body) patch.label = String(body.label || '').slice(0, 80) || row.label
  if ('status' in body) {
    if (!['active', 'disabled'].includes(String(body.status))) throw createError({ statusCode: 422, statusMessage: 'Estado no válido' })
    patch.status = String(body.status)
  }
  if ('businessAccountId' in body) patch.businessAccountId = body.businessAccountId ? String(body.businessAccountId).trim().slice(0, 40) : null
  if (body.isDefault === true) {
    await db.update(schema.commsChannels).set({ isDefault: 0 }).where(and(eq(schema.commsChannels.organizationId, orgId), ne(schema.commsChannels.id, row.id)))
    patch.isDefault = 1
  }

  let merged: ChannelCredentials | null = null
  if (body.credentials && typeof body.credentials === 'object') {
    if (!isCommsEncryptionAvailable(env)) throw createError({ statusCode: 503, statusMessage: 'Este Worker no tiene COMMS_CREDENTIALS_ENCRYPTION_KEY.' })
    const current = await decryptChannelCredentials(env, row)
    const incoming = body.credentials
    if (current.provider === 'meta_cloud') {
      merged = {
        provider: 'meta_cloud',
        accessToken: incoming.accessToken ? String(incoming.accessToken).trim() : current.accessToken,
        appSecret: incoming.appSecret ? String(incoming.appSecret).trim() : current.appSecret,
        verifyToken: incoming.verifyToken ? String(incoming.verifyToken).trim() : current.verifyToken,
      }
    } else {
      merged = {
        provider: 'twilio',
        accountSid: incoming.accountSid ? String(incoming.accountSid).trim() : current.accountSid,
        authToken: incoming.authToken ? String(incoming.authToken).trim() : current.authToken,
      }
    }
    const { ciphertext, iv } = await encryptChannelCredentials(env, merged)
    patch.credentialsCiphertext = ciphertext
    patch.credentialsIv = iv
    patch.lastError = null
  }
  if (Object.keys(patch).length === 1) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })

  const [updated] = await db.update(schema.commsChannels).set(patch).where(eq(schema.commsChannels.id, row.id)).returning()
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-channel', resourceId: row.id, detail: Object.keys(patch).filter((k) => !['updatedAt', 'credentialsCiphertext', 'credentialsIv'].includes(k)).concat(merged ? ['credentials'] : []).join(',') })
  let credentials: ChannelCredentials | null = merged
  if (!credentials && isCommsEncryptionAvailable(env)) {
    try {
      credentials = await decryptChannelCredentials(env, updated)
    } catch {
      credentials = null
    }
  }
  return { ok: true, channel: channelView(updated, credentials) }
})

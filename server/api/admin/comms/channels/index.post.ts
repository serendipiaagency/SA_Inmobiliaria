import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, isUniqueConstraintError, now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { channelView, encryptChannelCredentials, isCommsEncryptionAvailable } from '../../../../utils/comms/credentials'
import { normalizePhone } from '../../../../utils/comms/phone'
import { isProviderKey } from '../../../../utils/comms/providers/registry'
import type { ChannelCredentials } from '../../../../utils/comms/types'

/**
 * POST /api/admin/comms/channels — conecta un número.
 *
 * Body: { provider: 'meta_cloud'|'twilio'; label?: string; phone: string; externalPhoneId?: string; businessAccountId?: string; credentials: {...} }
 *   meta_cloud → externalPhoneId = phone_number_id (obligatorio); credentials { accessToken, appSecret?, verifyToken? }
 *   twilio     → externalPhoneId se deriva del teléfono (whatsapp:+E.164); credentials { accountSid, authToken }
 *
 * Las credenciales se cifran antes de tocar D1 y nunca vuelven en ninguna respuesta.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const env = cfEnv(event) as Record<string, any>
  if (!isCommsEncryptionAvailable(env)) {
    throw createError({ statusCode: 503, statusMessage: 'Este Worker no tiene COMMS_CREDENTIALS_ENCRYPTION_KEY: no se pueden guardar credenciales. Configúralo con wrangler secret put (docs/communications.md).' })
  }
  const body = (await readBody(event)) || {}
  const provider = String(body.provider || '')
  if (!isProviderKey(provider)) throw createError({ statusCode: 422, statusMessage: 'Proveedor no válido' })
  const phone = normalizePhone(String(body.phone || ''))
  if (!phone) throw createError({ statusCode: 422, statusMessage: 'El número debe ir con prefijo internacional (+34…).' })
  const creds = body.credentials || {}

  let credentials: ChannelCredentials
  let externalPhoneId: string
  if (provider === 'meta_cloud') {
    externalPhoneId = String(body.externalPhoneId || '').trim()
    if (!/^\d{6,20}$/.test(externalPhoneId)) throw createError({ statusCode: 422, statusMessage: 'Falta el phone_number_id de Meta (sólo dígitos).' })
    const accessToken = String(creds.accessToken || '').trim()
    if (accessToken.length < 20) throw createError({ statusCode: 422, statusMessage: 'Falta el token de acceso de Meta.' })
    credentials = { provider: 'meta_cloud', accessToken, ...(creds.appSecret ? { appSecret: String(creds.appSecret).trim() } : {}), ...(creds.verifyToken ? { verifyToken: String(creds.verifyToken).trim() } : {}) }
    if (!credentials.appSecret && !env.WHATSAPP_APP_SECRET) {
      throw createError({ statusCode: 422, statusMessage: 'Falta el App Secret de la app de Meta (o WHATSAPP_APP_SECRET en el Worker): sin él no se puede verificar la firma de los webhooks.' })
    }
  } else {
    externalPhoneId = `whatsapp:${phone}`
    const accountSid = String(creds.accountSid || '').trim()
    const authToken = String(creds.authToken || '').trim()
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw createError({ statusCode: 422, statusMessage: 'El Account SID de Twilio empieza por AC y tiene 34 caracteres.' })
    if (authToken.length < 16) throw createError({ statusCode: 422, statusMessage: 'Falta el Auth Token de Twilio.' })
    credentials = { provider: 'twilio', accountSid, authToken }
  }

  const db = useDb(event)
  const { ciphertext, iv } = await encryptChannelCredentials(env, credentials)
  const existing = await db.select({ id: schema.commsChannels.id }).from(schema.commsChannels).where(and(eq(schema.commsChannels.organizationId, orgId), eq(schema.commsChannels.status, 'active'))).limit(1)
  const nowTs = now()
  try {
    const [row] = await db
      .insert(schema.commsChannels)
      .values({
        organizationId: orgId,
        provider,
        label: String(body.label || '').slice(0, 80) || (provider === 'meta_cloud' ? 'WhatsApp (Meta)' : 'WhatsApp (Twilio)'),
        phoneE164: phone,
        externalPhoneId,
        businessAccountId: body.businessAccountId ? String(body.businessAccountId).trim().slice(0, 40) : null,
        credentialsCiphertext: ciphertext,
        credentialsIv: iv,
        keyVersion: 1,
        status: 'active',
        isDefault: existing[0] ? 0 : 1,
        callingStatus: provider === 'twilio' ? 'unavailable' : 'unknown',
        callingNote: provider === 'twilio' ? 'Twilio no ofrece llamadas de voz por WhatsApp para remitentes fuera de BR/MX/ID/IN.' : null,
        createdBy: user.id,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning()
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'comms-channel', resourceId: row.id, detail: `${provider}:${phone}` })
    return { ok: true, channel: channelView(row, credentials) }
  } catch (e: any) {
    if (isUniqueConstraintError(e)) throw createError({ statusCode: 409, statusMessage: 'Ese número ya está conectado (en esta u otra agencia de la plataforma).' })
    throw e
  }
})

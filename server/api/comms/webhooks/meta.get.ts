import { cfEnv, useDb } from '../../../utils/db'
import { metaVerifyTokens } from '../../../utils/comms/credentials'
import { verifyMetaWebhookToken } from '../../../utils/comms/providers/metaCloud'

/**
 * Handshake de verificación del webhook de Meta: al registrar la URL en la
 * app, Meta hace GET con hub.mode=subscribe, hub.verify_token y
 * hub.challenge, y espera el challenge en claro como respuesta. Sin sesión
 * por diseño; la credencial es el token de verificación, que puede ser el
 * del Worker (WHATSAPP_WEBHOOK_VERIFY_TOKEN) o el guardado cifrado en algún
 * canal de Meta (Configuración → Comunicaciones).
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event) as Record<string, any>
  const tokens = await metaVerifyTokens(useDb(event), env)
  if (!tokens.length) throw createError({ statusCode: 503, statusMessage: 'Meta webhook not configured: no verify token on this Worker or in any channel.' })
  const { ok, challenge } = verifyMetaWebhookToken(getQuery(event) as Record<string, any>, tokens)
  if (!ok || !challenge) throw createError({ statusCode: 403, statusMessage: 'Invalid verify token' })
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return challenge
})

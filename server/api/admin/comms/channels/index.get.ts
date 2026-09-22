import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, useDb } from '../../../../utils/db'
import { isCommsEncryptionAvailable, listChannels } from '../../../../utils/comms/credentials'
import { PROVIDERS } from '../../../../utils/comms/providers/registry'

/** GET /api/admin/comms/channels — los números conectados de la organización, sin ningún secreto. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'system', 'read')
  const env = cfEnv(event) as Record<string, any>
  const origin = getRequestURL(event).origin
  return {
    encryptionAvailable: isCommsEncryptionAvailable(env),
    rows: await listChannels(useDb(event), env, orgId),
    providers: Object.values(PROVIDERS),
    webhooks: {
      meta: `${origin}/api/comms/webhooks/meta`,
      twilioInbound: `${origin}/api/comms/webhooks/twilio/inbound`,
      twilioStatus: `${origin}/api/comms/webhooks/twilio/status`,
    },
    platformSecrets: { appSecret: Boolean(env.WHATSAPP_APP_SECRET), verifyToken: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) },
  }
})

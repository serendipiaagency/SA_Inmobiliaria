import { requireOrgScope } from '../../../utils/auth'
import { cfEnv, useDb } from '../../../utils/db'
import { orgCapabilities, unreadTotal } from '../../../utils/comms/admin'
import { isCommsEncryptionAvailable } from '../../../utils/comms/credentials'
import { getCommsSettings } from '../../../utils/comms/inbox'
import { PROVIDERS } from '../../../utils/comms/providers/registry'

/**
 * GET /api/admin/comms/overview — lo que la bandeja necesita para pintarse:
 * canales (sin secretos), capacidades efectivas, ajustes, no leídos y si el
 * Worker puede siquiera guardar credenciales. Sirve también para que los
 * botones "WhatsApp"/"Llamar" de Clientes y Leads sepan si hay canal.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const { channels, defaultChannel, capabilities } = await orgCapabilities(db, env, orgId)
  const [settings, unread] = await Promise.all([getCommsSettings(db, orgId), unreadTotal(db, orgId)])
  return {
    configured: Boolean(defaultChannel),
    encryptionAvailable: isCommsEncryptionAvailable(env),
    channels,
    defaultChannelId: defaultChannel?.id ?? null,
    capabilities,
    settings,
    unread,
    providers: Object.values(PROVIDERS).map((p) => ({ key: p.key, label: p.label, summary: p.summary, capabilities: p.capabilities, requirements: p.requirements })),
  }
})

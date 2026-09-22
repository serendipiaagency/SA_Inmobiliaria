import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../../utils/db'
import { loadConversationForOrg } from '../../../../../utils/comms/admin'
import { loadChannel } from '../../../../../utils/comms/credentials'
import { markConversationRead } from '../../../../../utils/comms/inbox'

/** POST /api/admin/comms/conversations/:id/read — a cero los no leídos (y "leído" en el WhatsApp del cliente si el proveedor lo permite). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, channelRow } = await loadConversationForOrg(db, orgId, id)
  // Sin clave de cifrado no se puede avisar al proveedor; el contador local se limpia igual.
  const channel = await loadChannel(db, env, { id: channelRow.id, orgId }).catch(() => null)
  if (channel) {
    await markConversationRead(db, env, channel, conversation)
  } else if (conversation.unreadCount > 0) {
    await db.update(schema.commsConversations).set({ unreadCount: 0, updatedAt: now() }).where(eq(schema.commsConversations.id, conversation.id))
  }
  return { ok: true }
})

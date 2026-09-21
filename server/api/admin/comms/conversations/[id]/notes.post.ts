import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { loadConversationForOrg, serializeMessage } from '../../../../../utils/comms/admin'
import { addInternalNote } from '../../../../../utils/comms/inbox'

/** POST /api/admin/comms/conversations/:id/notes — nota interna en el hilo; nunca se envía al contacto. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  const { conversation } = await loadConversationForOrg(db, orgId, id)
  const body = (await readBody(event)) || {}
  const text = String(body.body || '').trim()
  if (!text) throw createError({ statusCode: 422, statusMessage: 'La nota está vacía.' })
  const row = await addInternalNote(db, { orgId, conversationId: conversation.id, userId: user.id, body: text.slice(0, 4000) })
  return { ok: true, message: serializeMessage(row) }
})

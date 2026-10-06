import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { loadConversationForOrg, serializeMessage } from '../../../../../utils/comms/admin'
import { addInternalNote } from '../../../../../utils/comms/inbox'
import { addWebThreadNote, loadWebThreadForOrg, parseWebThreadKey } from '../../../../../utils/comms/web'

/**
 * POST /api/admin/comms/conversations/:id/notes — nota interna en el hilo; nunca se envía al contacto.
 * Núcleo N8a: con `:id = w<n>` la nota va al hilo web (y el widget del chat nunca la ve).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const body = (await readBody(event)) || {}
  const webId = parseWebThreadKey(getRouterParam(event, 'id'))
  if (webId) {
    const thread = await loadWebThreadForOrg(db, orgId, webId)
    return { ok: true, message: await addWebThreadNote(db, thread, user.id, body.body) }
  }
  const id = Number(getRouterParam(event, 'id'))
  const { conversation } = await loadConversationForOrg(db, orgId, id)
  const text = String(body.body || '').trim()
  if (!text) throw createError({ statusCode: 422, statusMessage: 'La nota está vacía.' })
  const row = await addInternalNote(db, { orgId, conversationId: conversation.id, userId: user.id, body: text.slice(0, 4000) })
  return { ok: true, message: serializeMessage(row) }
})

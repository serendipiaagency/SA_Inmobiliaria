import { requireOrgScope } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { createFollowUpVisit, crmNamesFor, loadConversationForOrg, serializeContact } from '../../../../../utils/comms/admin'
import { addInternalNote } from '../../../../../utils/comms/inbox'
import { logAdminAction } from '../../../../../utils/audit'

/**
 * POST /api/admin/comms/conversations/:id/follow-up — programa un seguimiento
 * (llamada, videollamada o visita) en la agenda del comercial: una fila real
 * de `visits`, la misma que ve Visitas y la que dispara los recordatorios.
 *
 * Body: { agentId: number; scheduledAt: 'YYYY-MM-DD HH:MM:SS'; channel?: 'phone'|'video'|'in_person'; propertyId?: number; notes?: string }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  const { conversation, contact } = await loadConversationForOrg(db, orgId, id)
  const body = (await readBody(event)) || {}
  const channel = ['phone', 'video', 'in_person'].includes(String(body.channel)) ? (String(body.channel) as 'phone' | 'video' | 'in_person') : 'phone'
  const crm = await crmNamesFor(db, orgId, [contact])
  const contactName = serializeContact(contact, crm).name

  const visit = await createFollowUpVisit(db, {
    orgId,
    contact,
    contactName,
    agentId: Number(body.agentId),
    scheduledAt: String(body.scheduledAt || ''),
    channel,
    propertyId: body.propertyId ? Number(body.propertyId) : (conversation.propertyId ?? null),
    notes: body.notes ? String(body.notes) : null,
  })
  await addInternalNote(db, {
    orgId,
    conversationId: conversation.id,
    userId: user.id,
    body: `Seguimiento programado: ${channel === 'phone' ? 'llamada' : channel === 'video' ? 'videollamada' : 'visita'} el ${visit.scheduledAt} con ${visit.agentName}${visit.propertyName ? ` · ${visit.propertyName}` : ''}.`,
  })
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'visit', resourceId: visit.id, detail: 'seguimiento desde Comunicaciones' })
  return { ok: true, visit }
})

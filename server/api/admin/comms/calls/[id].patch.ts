import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { createFollowUpVisit, crmNamesFor, loadCallForOrg, loadContactForOrg, serializeCall, serializeContact } from '../../../../utils/comms/admin'
import { isCallOutcome } from '../../../../utils/comms/calls'
import { addInternalNote } from '../../../../utils/comms/inbox'

/**
 * PATCH /api/admin/comms/calls/:id — resultado y notas de una llamada ya
 * hecha, y opcionalmente el seguimiento en la agenda.
 *
 * Body: { outcome?: CallOutcome; notes?: string; followUp?: { agentId: number; scheduledAt: string; channel?: 'phone'|'video'|'in_person'; propertyId?: number; notes?: string } }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const call = await loadCallForOrg(db, orgId, Number(getRouterParam(event, 'id')))
  const body = (await readBody(event)) || {}
  const patch: Record<string, any> = { updatedAt: now() }
  if ('outcome' in body) {
    if (!isCallOutcome(body.outcome)) throw createError({ statusCode: 422, statusMessage: 'Resultado no válido' })
    patch.outcome = body.outcome
  }
  if ('notes' in body) patch.notes = body.notes ? String(body.notes).slice(0, 4000) : null

  let visit: { id: number; scheduledAt: string; agentName: string; propertyName: string | null } | null = null
  if (body.followUp) {
    const contact = await loadContactForOrg(db, orgId, call.contactId)
    const contactName = serializeContact(contact, await crmNamesFor(db, orgId, [contact])).name
    visit = await createFollowUpVisit(db, {
      orgId,
      contact,
      contactName,
      agentId: Number(body.followUp.agentId),
      scheduledAt: String(body.followUp.scheduledAt || ''),
      channel: ['phone', 'video', 'in_person'].includes(String(body.followUp.channel)) ? body.followUp.channel : 'phone',
      propertyId: body.followUp.propertyId ? Number(body.followUp.propertyId) : (call.propertyId ?? null),
      notes: body.followUp.notes ? String(body.followUp.notes) : null,
    })
    patch.followUpVisitId = visit.id
    if (call.conversationId) {
      await addInternalNote(db, { orgId, conversationId: call.conversationId, userId: user.id, body: `Seguimiento programado tras la llamada: ${visit.scheduledAt} con ${visit.agentName}${visit.propertyName ? ` · ${visit.propertyName}` : ''}.` })
    }
  }
  if (Object.keys(patch).length === 1) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })
  const [updated] = await db.update(schema.commsCalls).set(patch).where(eq(schema.commsCalls.id, call.id)).returning()
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-call', resourceId: call.id, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') })
  return { ok: true, call: serializeCall(updated), visit }
})

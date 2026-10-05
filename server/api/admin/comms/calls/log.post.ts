import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { propertyState } from '../../../../utils/properties/trash'
import { loadContactForOrg, loadConversationForOrg, serializeCall } from '../../../../utils/comms/admin'
import { isCallOutcome, logManualCall } from '../../../../utils/comms/calls'
import { logAdminAction } from '../../../../utils/audit'
import { PROPERTY_KINDS, type PropertyKind } from '../../../../utils/matching/service'

/**
 * POST /api/admin/comms/calls/log — registra a mano una llamada telefónica
 * (la que se hace con el móvil o la centralita): dirección, resultado,
 * notas y duración. Es lo que hay cuando el proveedor no permite llamar
 * desde el navegador, y sigue siendo actividad real en la ficha.
 *
 * Body: { conversationId?: number; contactId?: number; direction: 'inbound'|'outbound'; outcome: CallOutcome; notes?: string; durationSeconds?: number; agentId?: number; propertyId?: number; propertyKind?: 'agent'|'developer' }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const body = (await readBody(event)) || {}
  if (!isCallOutcome(body.outcome)) throw createError({ statusCode: 422, statusMessage: 'Indica el resultado de la llamada.' })
  const direction = body.direction === 'inbound' ? 'inbound' : 'outbound'

  let contactId: number
  let conversationId: number | null = null
  let propertyId: number | null = body.propertyId ? Number(body.propertyId) : null
  let propertyKind: PropertyKind | null = propertyId ? (PROPERTY_KINDS.includes(body.propertyKind) ? body.propertyKind : 'developer') : null
  if (body.conversationId) {
    const { conversation, contact } = await loadConversationForOrg(db, orgId, Number(body.conversationId))
    contactId = contact.id
    conversationId = conversation.id
    if (!propertyId && conversation.propertyId) {
      // La propiedad de contexto del hilo, con SU catálogo (puede ser de 2ª mano).
      propertyId = conversation.propertyId
      propertyKind = conversation.propertyKind === 'agent' ? 'agent' : 'developer'
    }
  } else if (body.contactId) {
    contactId = (await loadContactForOrg(db, orgId, Number(body.contactId))).id
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Indica conversationId o contactId.' })
  }

  // La propiedad y el comercial que llegan en el cuerpo se comprueban dentro
  // de la agencia (404 si no), igual que cualquier otra referencia del panel.
  if (body.propertyId && propertyId && propertyKind && (await propertyState(db, orgId, propertyKind, propertyId)) === 'missing') {
    throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
  }
  const agentId = body.agentId ? Number(body.agentId) : null
  if (agentId) {
    const [tm] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, agentId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
    if (!tm) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado' })
  }

  const call = await logManualCall(db, {
    orgId,
    contactId,
    conversationId,
    direction,
    outcome: body.outcome,
    notes: body.notes ? String(body.notes).slice(0, 4000) : null,
    durationSeconds: body.durationSeconds ? Math.max(0, Math.round(Number(body.durationSeconds))) : null,
    userId: user.id,
    agentId,
    propertyId,
    propertyKind,
  })
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'comms-call', resourceId: call.id, detail: `manual:${direction}:${body.outcome}` })
  return { ok: true, call: serializeCall(call) }
})

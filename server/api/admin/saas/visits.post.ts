import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createAdminAppointment } from '../../../utils/appointments/adminCreate'
import { logAdminAction } from '../../../utils/audit'

interface CreateVisitBody {
  clientName?: string
  clientEmail?: string | null
  clientPhone?: string | null
  agentId?: number
  propertyId?: number | null
  propertyKind?: 'agent' | 'developer' | null
  scheduledAt?: string
  channel?: string
  type?: string
  leadId?: number | null
  /** FASE 24: cita de notaría/firma de un Deal. */
  dealId?: number | null
}

/** POST /api/admin/saas/visits — crear una cita suelta desde el panel (Calendar "crear desde hueco", FASE 20). No pasa por un Tour. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<CreateVisitBody>(event)) || {}

  if (!body.agentId) throw createError({ statusCode: 422, statusMessage: 'Falta el comercial' })

  const visit = await createAdminAppointment(db, orgId, {
    clientName: String(body.clientName || ''),
    clientEmail: body.clientEmail || null,
    clientPhone: body.clientPhone || null,
    agentId: Number(body.agentId),
    propertyId: body.propertyId ? Number(body.propertyId) : null,
    propertyKind: body.propertyKind || null,
    scheduledAt: String(body.scheduledAt || ''),
    channel: body.channel,
    type: body.type,
    leadId: body.leadId ? Number(body.leadId) : null,
    dealId: body.dealId ? Number(body.dealId) : null,
  })

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'visit', resourceId: visit.id })
  return visit
})

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
  /** Fin libre (o `durationMinutes`); sin ninguno, la franja del comercial. */
  endsAt?: string | null
  durationMinutes?: number | null
  channel?: string
  type?: string
  leadId?: number | null
  contactId?: number | null
  officeId?: number | null
  timezone?: string | null
  meetingPoint?: string | null
  notes?: string | null
  internalNotes?: string | null
  confirmationStatus?: string | null
  /** FASE 24: cita de notaría/firma de un Deal. */
  dealId?: number | null
}

const idOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))

/**
 * POST /api/admin/saas/visits — crear una cita suelta desde el panel
 * (Calendar "crear desde hueco", FASE 20) con todos los tipos y campos de
 * FASE 17. No pasa por un Tour. La validación vive en
 * server/utils/appointments/adminCreate.ts.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<CreateVisitBody>(event)) || {}

  if (!body.agentId) throw createError({ statusCode: 422, statusMessage: 'Falta el comercial' })

  const visit = await createAdminAppointment(db, orgId, {
    clientName: body.clientName ? String(body.clientName) : null,
    clientEmail: body.clientEmail || null,
    clientPhone: body.clientPhone || null,
    agentId: Number(body.agentId),
    propertyId: idOrNull(body.propertyId),
    propertyKind: body.propertyKind || null,
    scheduledAt: String(body.scheduledAt || ''),
    endsAt: body.endsAt || null,
    durationMinutes: body.durationMinutes === undefined || body.durationMinutes === null ? null : Number(body.durationMinutes),
    channel: body.channel,
    type: body.type,
    leadId: idOrNull(body.leadId),
    contactId: idOrNull(body.contactId),
    officeId: idOrNull(body.officeId),
    timezone: body.timezone ?? null,
    meetingPoint: body.meetingPoint ?? null,
    notes: body.notes ?? null,
    internalNotes: body.internalNotes ?? null,
    confirmationStatus: body.confirmationStatus ?? null,
    dealId: idOrNull(body.dealId),
    createdBy: user.id,
  })

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'visit', resourceId: visit.id })
  return visit
})

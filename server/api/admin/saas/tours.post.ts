import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createTour, type TourStopInput } from '../../../utils/appointments/tours'
import { logAdminAction } from '../../../utils/audit'

interface CreateTourBody {
  clientName?: string
  clientEmail?: string | null
  clientPhone?: string | null
  leadId?: number | null
  notes?: string | null
  stops?: Array<{ propertyId?: number | null; agentId?: number; scheduledAt?: string; channel?: string }>
}

const VALID_CHANNELS = ['in_person', 'video', 'phone']

/** POST /api/admin/saas/tours — crea un tour con todas sus paradas de una vez (pages/admin/visitas.vue, "Nuevo tour"). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<CreateTourBody>(event)) || {}

  const clientName = String(body.clientName || '').trim()
  if (!clientName) throw createError({ statusCode: 422, statusMessage: 'clientName es obligatorio' })
  if (!body.clientEmail && !body.clientPhone) throw createError({ statusCode: 422, statusMessage: 'email o teléfono es obligatorio' })
  if (!Array.isArray(body.stops) || !body.stops.length) throw createError({ statusCode: 422, statusMessage: 'Un tour necesita al menos una parada' })

  const stops: TourStopInput[] = body.stops.map((s, i) => {
    const agentId = Number(s.agentId)
    if (!agentId) throw createError({ statusCode: 422, statusMessage: `Parada ${i + 1}: falta el comercial` })
    const channel = VALID_CHANNELS.includes(String(s.channel)) ? (s.channel as TourStopInput['channel']) : 'in_person'
    return { propertyId: s.propertyId ? Number(s.propertyId) : null, agentId, scheduledAt: String(s.scheduledAt || ''), channel }
  })

  const tour = await createTour(db, orgId, {
    clientName,
    clientEmail: body.clientEmail || null,
    clientPhone: body.clientPhone || null,
    leadId: body.leadId ? Number(body.leadId) : null,
    notes: body.notes || null,
    stops,
  })

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'tour', resourceId: tour.id, detail: `${stops.length} paradas` })
  return tour
})

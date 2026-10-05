import { requireOrgScope } from '../../../utils/auth'
import { useDb, cfEnv } from '../../../utils/db'
import { createTour, reorderTour, updateTour, type TourStopInput } from '../../../utils/appointments/tours'
import { logAdminAction } from '../../../utils/audit'
import { getRequestId } from '../../../utils/requestId'

interface TourBody {
  /** Sin `action` (o 'create'): crear. 'update': editar la cabecera. 'reorder': reordenar paradas y, si se pide, recalcular horas. */
  action?: 'create' | 'update' | 'reorder'
  tourId?: number
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  leadId?: number | null
  contactId?: number | null
  notes?: string | null
  timezone?: string | null
  stops?: Array<{ propertyId?: number | null; propertyKind?: 'agent' | 'developer' | null; agentId?: number; scheduledAt?: string; endsAt?: string | null; durationMinutes?: number | null; channel?: string; meetingPoint?: string | null }>
  stopIds?: number[]
  recalculate?: boolean
  gapMinutes?: number | null
  startAt?: string | null
}

const idOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))

/**
 * POST /api/admin/saas/tours (pages/admin/visitas.vue, pestaña Tours) — un
 * único endpoint con tres acciones (margen de rutas de Nitro = 0):
 *  - crear un tour con todas sus paradas de una vez (cada parada con su
 *    hora y duración, inmueble de obra nueva o de 2ª mano, lead/contacto y notas);
 *  - `action: 'update'` + `tourId`: editar cliente, lead, contacto y notas;
 *  - `action: 'reorder'` + `tourId` + `stopIds`: reordenar la ruta y, con
 *    `recalculate`, encadenar de nuevo las horas (`gapMinutes`, `startAt`).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<TourBody>(event)) || {}

  if (body.action === 'update') {
    const res = await updateTour(db, orgId, Number(body.tourId), {
      clientName: body.clientName === undefined || body.clientName === null ? undefined : String(body.clientName),
      clientEmail: body.clientEmail,
      clientPhone: body.clientPhone,
      leadId: body.leadId === undefined ? undefined : idOrNull(body.leadId),
      contactId: body.contactId === undefined ? undefined : idOrNull(body.contactId),
      notes: body.notes,
    })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'tour', resourceId: res.id })
    return res
  }

  if (body.action === 'reorder') {
    const res = await reorderTour(
      db,
      orgId,
      Number(body.tourId),
      { stopIds: Array.isArray(body.stopIds) ? body.stopIds.map(Number) : [], recalculate: !!body.recalculate, gapMinutes: body.gapMinutes ?? null, startAt: body.startAt ?? null },
      { userId: user.id, env: cfEnv(event), requestId: getRequestId(event), publicOrigin: getRequestURL(event).origin },
    )
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'tour', resourceId: res.id, detail: `reordenado${res.moved.length ? `, ${res.moved.length} paradas movidas` : ''}` })
    return res
  }

  if (!Array.isArray(body.stops) || !body.stops.length) throw createError({ statusCode: 422, statusMessage: 'Un tour necesita al menos una parada' })
  const stops: TourStopInput[] = body.stops.map((s, i) => {
    const agentId = Number(s.agentId)
    if (!agentId) throw createError({ statusCode: 422, statusMessage: `Parada ${i + 1}: falta el comercial` })
    return {
      propertyId: idOrNull(s.propertyId),
      propertyKind: s.propertyKind || null,
      agentId,
      scheduledAt: String(s.scheduledAt || ''),
      endsAt: s.endsAt || null,
      durationMinutes: s.durationMinutes === undefined || s.durationMinutes === null || (s.durationMinutes as any) === '' ? null : Number(s.durationMinutes),
      channel: (s.channel || undefined) as TourStopInput['channel'],
      meetingPoint: s.meetingPoint ?? null,
    }
  })

  const tour = await createTour(db, orgId, {
    clientName: body.clientName ? String(body.clientName) : null,
    clientEmail: body.clientEmail || null,
    clientPhone: body.clientPhone || null,
    leadId: idOrNull(body.leadId),
    contactId: idOrNull(body.contactId),
    notes: body.notes || null,
    timezone: body.timezone ?? null,
    stops,
    createdBy: user.id,
  })

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'tour', resourceId: tour.id, detail: `${stops.length} paradas` })
  return tour
})

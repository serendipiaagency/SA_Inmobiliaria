import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { MatchStatusError, setMatchStatus, PROPERTY_KINDS, type MatchStatus, type PropertyKind } from '../../../../utils/matching/service'
import { createSelectionFromMatch, createVisitFromMatch, parseSelectionItems } from '../../../../utils/matching/actions'

interface MatchActionBody {
  /**
   * Qué se hace con la compatibilidad (núcleo N4). Sin `action` es `status`,
   * el comportamiento de siempre.
   *
   * - `status`    → { buyerRequirementId, propertyId, propertyKind, status: 'new'|'selected'|'discarded', discardedReason? }
   * - `selection` → { buyerRequirementId, items: [{ propertyId, propertyKind, note? }] (o propertyId + propertyKind), title?, notes?, selectionId? }
   * - `visit`     → { buyerRequirementId, propertyId, propertyKind, agentId, scheduledAt: 'AAAA-MM-DD HH:MM:SS', channel? }
   */
  action?: 'status' | 'selection' | 'visit'
  buyerRequirementId: number
  propertyId?: number
  propertyKind?: PropertyKind
  status?: MatchStatus
  discardedReason?: string
  items?: { propertyId: number; propertyKind?: PropertyKind; note?: string }[]
  title?: string
  notes?: string
  selectionId?: number
  agentId?: number
  scheduledAt?: string
  channel?: string
}

const ACTIONS = ['status', 'selection', 'visit'] as const

/**
 * Las acciones sobre una compatibilidad (necesidad ↔ inmueble):
 *
 * - `status`: guardar la decisión comercial — seleccionar, descartar (con
 *   motivo) o devolverla a «nuevo». El score y el desglose NO se aceptan del
 *   cliente: se recalculan en el servidor con el motor. Si el navegador
 *   pudiera enviarlos, el histórico diría lo que quisiera quien llamó a la API.
 * - `selection`: crear una selección de propiedades para el contacto de la
 *   necesidad, o añadirlas a una suya que ya existía (servicio de selecciones
 *   de INMO).
 * - `visit`: agendar una visita del contacto de la necesidad a ese inmueble
 *   (`createAdminAppointment`, la misma validación que Calendar).
 *
 * «Enviar propiedad» no está aquí a propósito: es un envío real por el Centro
 * de Comunicaciones (`comms/conversations/:id/share-property`), el único que
 * puede marcar un match como enviado.
 *
 * Necesidad, contacto, propiedades y selección se comprueban contra la
 * organización de la sesión: lo ajeno responde 404.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = ((await readBody<MatchActionBody>(event)) || {}) as MatchActionBody
  const action = body.action ?? 'status'
  if (!(ACTIONS as readonly string[]).includes(action)) throw createError({ statusCode: 422, statusMessage: 'Acción no reconocida' })

  if (!Number.isInteger(body.buyerRequirementId)) throw createError({ statusCode: 422, statusMessage: 'Falta la necesidad' })
  const propertyKind: PropertyKind = PROPERTY_KINDS.includes(body.propertyKind as PropertyKind) ? (body.propertyKind as PropertyKind) : 'agent'

  try {
    if (action === 'selection') {
      const res = await createSelectionFromMatch(
        event,
        orgId,
        {
          buyerRequirementId: body.buyerRequirementId,
          items: parseSelectionItems(body),
          title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
          notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
          selectionId: body.selectionId ? Number(body.selectionId) : null,
        },
        { userId: user.id },
      )
      await logAdminAction(event, {
        user,
        orgId,
        action: res.created ? 'create' : 'update',
        resource: 'property_selection',
        resourceId: res.selection?.id,
        detail: `${res.added} propiedad(es) desde la necesidad ${body.buyerRequirementId}`,
      })
      return res
    }

    if (!Number.isInteger(body.propertyId)) throw createError({ statusCode: 422, statusMessage: 'Faltan la necesidad y el inmueble' })
    const propertyId = body.propertyId as number

    if (action === 'visit') {
      const res = await createVisitFromMatch(
        event,
        orgId,
        {
          buyerRequirementId: body.buyerRequirementId,
          propertyId,
          propertyKind,
          agentId: Number(body.agentId),
          scheduledAt: String(body.scheduledAt || ''),
          channel: body.channel,
        },
        { userId: user.id },
      )
      await logAdminAction(event, { user, orgId, action: 'create', resource: 'visit', resourceId: res.visit.id, detail: `desde la necesidad ${body.buyerRequirementId}` })
      return res
    }

    const match = await setMatchStatus(
      event,
      orgId,
      {
        buyerRequirementId: body.buyerRequirementId,
        propertyId,
        propertyKind,
        status: body.status as MatchStatus,
        discardedReason: typeof body.discardedReason === 'string' ? body.discardedReason.slice(0, 500) : undefined,
      },
      { userId: user.id },
    )

    await logAdminAction(event, {
      user,
      orgId,
      action: 'update',
      resource: 'property_match',
      resourceId: match.id,
      detail: `${body.status}${body.discardedReason ? `: ${body.discardedReason}` : ''}`,
    })

    return match
  } catch (error) {
    if (error instanceof MatchStatusError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }
})

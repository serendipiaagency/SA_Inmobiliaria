import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { hasAreaAccess } from '../../../utils/permissions'
import { createDeal, transitionDealStage, closeDeal, cancelDeal, updateDeal, linkDealRecord, unlinkDealRecord, trashDeal, restoreDeal, DEAL_RECORD_KINDS, type DealStage, type DealRecordKind } from '../../../utils/deals/service'
import { logAdminAction } from '../../../utils/audit'

interface DealOperationPostBody {
  /** Sin `action`: "Crear operación" — única forma de nacer un Deal, siempre sobre una Offer ya `accepted` (§94, nunca automático). */
  acceptedOfferId?: number
  /** Con `action`: transición o cambio sobre una operación ya existente. */
  action?: 'stage' | 'close' | 'cancel' | 'update' | 'link' | 'unlink' | 'trash' | 'restore'
  id?: number
  toStage?: string
  reason?: string
  /** `action: 'update'` — oficina (entidad Oficinas) y comercial; `null` los quita. */
  officeId?: number | null
  commercialId?: number | null
  /** `action: 'link'|'unlink'` — qué se vincula: reserva, arras (depósito) o contrato, y su id. */
  kind?: string
  recordId?: number
}

function optionalId(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw createError({ statusCode: 422, statusMessage: 'Identificador no válido' })
  return n
}

/**
 * POST /api/admin/saas/deal-operations — crea la operación (sin `action`) o
 * actúa sobre una existente (`id` + `action`):
 *  - `stage` (`toStage`, `reason` opcional) — mover de etapa, queda en el historial;
 *  - `close` / `cancel` (`reason` obligatorio al cancelar);
 *  - `update` (`officeId`, `commercialId`) — bloque N6;
 *  - `link` / `unlink` (`kind`: reservation|deposit|contract, `recordId`) —
 *    bloque N6: reservas, arras y contratos de la operación;
 *  - `trash` / `restore` — cierre C1: mandarla a la papelera (409 si está
 *    cerrada o tiene reserva, arras o contrato vinculados; ver `trashDeal()`)
 *    y sacarla de ella.
 *
 * Todo bajo una única clave de ruta a propósito — ver el comentario en
 * `deal-operations.get.ts` sobre el margen que entonces tenía
 * `npm run typecheck` frente al TS2589 de Nitro, ya resuelto
 * (docs/production-hardening-audit.md, P1-14).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = (await readBody<DealOperationPostBody>(event)) || {}
  const db = useDb(event)

  if (!body.action) {
    if (!body.acceptedOfferId) throw createError({ statusCode: 422, statusMessage: 'Falta la oferta aceptada' })
    const deal = await createDeal(db, orgId, { acceptedOfferId: Number(body.acceptedOfferId) }, { createdBy: user.id })
    await logAdminAction(event, { user, orgId, action: 'create', resource: 'deal', resourceId: deal.id })
    return deal
  }

  const dealId = Number(body.id)
  if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  if (body.action === 'stage') {
    if (!body.toStage) throw createError({ statusCode: 422, statusMessage: 'Falta la etapa destino' })
    const deal = await transitionDealStage(db, orgId, dealId, body.toStage as DealStage, { actorType: 'user', actorId: user.id, reason: body.reason?.trim() || null })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: `stage:${body.toStage}` })
    return deal
  }

  if (body.action === 'close') {
    const deal = await closeDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'closed' })
    return deal
  }

  if (body.action === 'cancel') {
    if (!body.reason?.trim()) throw createError({ statusCode: 422, statusMessage: 'Indica el motivo de la cancelación' })
    const deal = await cancelDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id, reason: body.reason.trim() })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'cancelled' })
    return deal
  }

  if (body.action === 'update') {
    const deal = await updateDeal(db, orgId, dealId, { officeId: optionalId(body.officeId), commercialId: optionalId(body.commercialId) })
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: 'office/commercial' })
    return deal
  }

  if (body.action === 'link' || body.action === 'unlink') {
    if (!(DEAL_RECORD_KINDS as readonly string[]).includes(String(body.kind))) throw createError({ statusCode: 422, statusMessage: 'Indica qué vincular: reserva, arras o contrato' })
    const kind = body.kind as DealRecordKind
    const recordId = optionalId(body.recordId)
    if (!recordId) throw createError({ statusCode: 422, statusMessage: 'Falta el documento a vincular' })
    // Arras y contratos son del área Finanzas: tocarlos exige poder escribir en ella (la reserva es CRM, como esta ruta).
    if (kind !== 'reservation' && !hasAreaAccess(user, 'finance', 'write')) throw createError({ statusCode: 403, statusMessage: 'No tienes permiso para vincular arras o contratos (área Finanzas).' })
    const actor = { actorType: 'user' as const, actorId: user.id }
    const result = body.action === 'link' ? await linkDealRecord(db, orgId, dealId, kind, recordId, actor) : await unlinkDealRecord(db, orgId, dealId, kind, recordId, actor)
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: dealId, detail: `${body.action}:${kind}:${recordId}` })
    return result
  }

  if (body.action === 'trash') {
    const deal = await trashDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id }, { includeFinance: hasAreaAccess(user, 'finance', 'read') })
    await logAdminAction(event, { user, orgId, action: 'delete', resource: 'deal', resourceId: dealId, detail: 'papelera' })
    return deal
  }

  if (body.action === 'restore') {
    const deal = await restoreDeal(db, orgId, dealId, { actorType: 'user', actorId: user.id })
    await logAdminAction(event, { user, orgId, action: 'restore', resource: 'deal', resourceId: dealId })
    return deal
  }

  throw createError({ statusCode: 422, statusMessage: 'Acción no reconocida' })
})

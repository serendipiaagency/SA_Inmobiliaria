import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { hasAreaAccess } from '../../../utils/permissions'
import { countDealRecords, getDealDetail, listDeals, withDealLabels, DEAL_STAGES, DEAL_STATUSES, type DealStatus, type DealStage } from '../../../utils/deals/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * GET /api/admin/saas/deal-operations — lista de operaciones del pipeline
 * (FASE 24), o su ficha completa con `?id=` — no confundir con `saas/deals`
 * (cierres legacy para comisiones).
 *
 * Ficha bajo query, no bajo `/deal-operations/:id`: el margen real de
 * `npm run typecheck` frente al TS2589 de Nitro (ver `nitro-fetch-warmup.ts`
 * y docs/production-hardening-audit.md, P1-14) se agotó con el crecimiento
 * acumulado de las FASE 15-23 — a día de escribir esto sólo admite UNA clave
 * de ruta nueva en todo el proyecto antes de romperse, medido añadiendo
 * rutas una a una en un worktree limpio. Una ruta dinámica `/[id]` adicional
 * (aunque fuera una sola) ya lo cruza. Consolidar todo bajo esta única clave
 * —list y detail por query, create/stage/close/cancel por `action` en el
 * body de `deal-operations.post.ts`— es lo que mantiene el pipeline entero
 * de Deal Operation dentro del margen de una sola clave nueva.
 *
 * Bloque N6: el listado (y el Kanban de `/admin/deal-operations`) filtra
 * también por `officeId`, y cada fila trae comprador, inmueble, comercial,
 * oficina y cuántos documentos (reserva, arras, contrato) tiene vinculados.
 * La ficha trae además esos documentos y los candidatos a vincular; arras y
 * contratos (área Finanzas) sólo si quien pregunta puede leer Finanzas.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const db = useDb(event)
  const includeFinance = hasAreaAccess(user, 'finance', 'read')

  if (q.id) {
    const dealId = Number(q.id)
    if (!Number.isFinite(dealId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    return getDealDetail(db, orgId, dealId, { includeFinance })
  }

  const deals = await listDeals(db, orgId, {
    propertyId: q.propertyId ? Number(q.propertyId) : undefined,
    propertyKind: (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : undefined,
    buyerContactId: q.buyerContactId ? Number(q.buyerContactId) : undefined,
    sellerContactId: q.sellerContactId ? Number(q.sellerContactId) : undefined,
    leadId: q.leadId ? Number(q.leadId) : undefined,
    commercialId: q.commercialId ? Number(q.commercialId) : undefined,
    officeId: q.officeId ? Number(q.officeId) : undefined,
    status: (DEAL_STATUSES as readonly string[]).includes(String(q.status)) ? (q.status as DealStatus) : undefined,
    stage: (DEAL_STAGES as readonly string[]).includes(String(q.stage)) ? (q.stage as DealStage) : undefined,
  })
  const [labeled, recordCounts] = await Promise.all([
    withDealLabels(db, orgId, deals),
    countDealRecords(
      db,
      orgId,
      deals.map((d) => d.id),
      includeFinance,
    ),
  ])
  const rows = labeled.map((d) => ({ ...d, linkedRecords: recordCounts.get(d.id) || 0 }))
  return { rows }
})

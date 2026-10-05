import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listOffers, withOfferLabels, OFFER_STATUSES, type ListOffersFilter, type OfferStatusFilter } from '../../../utils/offers/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * GET /api/admin/saas/offers — listado (FASE 23). Sin filtros lee todas las
 * de la organización, como Tareas/Calendar: es la página global «Ofertas» y
 * el panel de ofertas de la ficha de propiedad (bloque N6).
 *
 * Filtros: `propertyId`(+`propertyKind`) o sólo `propertyKind` (catálogo),
 * `buyerContactId`, `sellerContactId`, `leadId`, `commercialId` y `status`
 * (un estado, u `open` = borrador/enviada/contraoferta). Cada fila trae ya
 * comprador, vendedores, inmueble, comercial y su operación si la hay.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListOffersFilter = {}
  const kind = (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : undefined
  if (q.propertyId) {
    filter.propertyId = Number(q.propertyId)
    filter.propertyKind = kind ?? 'developer'
  } else if (kind) {
    filter.propertyKind = kind
  }
  if (q.buyerContactId) filter.buyerContactId = Number(q.buyerContactId)
  if (q.sellerContactId) filter.sellerContactId = Number(q.sellerContactId)
  if (q.leadId) filter.leadId = Number(q.leadId)
  if (q.commercialId) filter.commercialId = Number(q.commercialId)
  if (q.status && (q.status === 'open' || (OFFER_STATUSES as readonly string[]).includes(String(q.status)))) filter.status = q.status as OfferStatusFilter

  const rows = await withOfferLabels(db, orgId, await listOffers(db, orgId, filter))
  return { rows }
})

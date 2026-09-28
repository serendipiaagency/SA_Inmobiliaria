import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listOffers, type ListOffersFilter, type OfferStatus } from '../../../utils/offers/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/** GET /api/admin/saas/offers — listado (FASE 23). Sin filtros lee todas las de la organización, como Tareas/Calendar. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListOffersFilter = {}
  if (q.propertyId) {
    filter.propertyId = Number(q.propertyId)
    filter.propertyKind = (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : 'developer'
  }
  if (q.buyerContactId) filter.buyerContactId = Number(q.buyerContactId)
  if (q.sellerContactId) filter.sellerContactId = Number(q.sellerContactId)
  if (q.leadId) filter.leadId = Number(q.leadId)
  if (q.commercialId) filter.commercialId = Number(q.commercialId)
  if (q.status) filter.status = q.status as OfferStatus

  const rows = await listOffers(db, orgId, filter)
  return { rows }
})

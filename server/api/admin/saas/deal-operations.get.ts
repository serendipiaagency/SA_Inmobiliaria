import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listDeals, type DealStatus, type DealStage } from '../../../utils/deals/service'
import type { PropertyKind } from '../../../utils/matching/service'

/** GET /api/admin/saas/deal-operations — lista de operaciones del pipeline (FASE 24), no confundir con `saas/deals` (cierres legacy para comisiones). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const db = useDb(event)

  const rows = await listDeals(db, orgId, {
    propertyId: q.propertyId ? Number(q.propertyId) : undefined,
    propertyKind: q.propertyKind as PropertyKind | undefined,
    buyerContactId: q.buyerContactId ? Number(q.buyerContactId) : undefined,
    sellerContactId: q.sellerContactId ? Number(q.sellerContactId) : undefined,
    leadId: q.leadId ? Number(q.leadId) : undefined,
    commercialId: q.commercialId ? Number(q.commercialId) : undefined,
    status: q.status as DealStatus | undefined,
    stage: q.stage as DealStage | undefined,
  })
  return { rows }
})

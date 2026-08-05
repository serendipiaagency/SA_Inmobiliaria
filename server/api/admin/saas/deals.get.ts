import { and, desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Lists the org's closed deals — the real source for both the revenue dashboard and the commissions panel. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const conds = [eq(schema.deals.organizationId, orgId)]
  if (q.agentId) conds.push(eq(schema.deals.agentId, Number(q.agentId)))
  if (q.commissionPaid !== undefined) conds.push(eq(schema.deals.commissionPaid, q.commissionPaid === 'true' ? 1 : 0))

  const rows = await db
    .select()
    .from(schema.deals)
    .where(and(...conds))
    .orderBy(desc(schema.deals.closedAt))
    .limit(200)

  return { rows }
})

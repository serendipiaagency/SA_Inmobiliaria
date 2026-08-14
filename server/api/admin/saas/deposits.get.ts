import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return db
    .select({
      id: schema.depositPayments.id,
      contractId: schema.depositPayments.contractId,
      contractTitle: schema.contracts.title,
      amount: schema.depositPayments.amount,
      currency: schema.depositPayments.currency,
      status: schema.depositPayments.status,
      errorMessage: schema.depositPayments.errorMessage,
      createdAt: schema.depositPayments.createdAt,
      paidAt: schema.depositPayments.paidAt,
    })
    .from(schema.depositPayments)
    .leftJoin(schema.contracts, eq(schema.contracts.id, schema.depositPayments.contractId))
    .where(eq(schema.depositPayments.organizationId, orgId))
    .orderBy(desc(schema.depositPayments.id))
})

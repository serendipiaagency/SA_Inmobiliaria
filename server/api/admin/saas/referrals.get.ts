import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.referrals.id,
      refereeName: schema.referrals.refereeName,
      refereeEmail: schema.referrals.refereeEmail,
      status: schema.referrals.status,
      createdAt: schema.referrals.createdAt,
      convertedAt: schema.referrals.convertedAt,
      rewardedAt: schema.referrals.rewardedAt,
      referrerName: schema.referralLinks.referrerName,
      rewardType: schema.referralLinks.rewardType,
      rewardAmount: schema.referralLinks.rewardAmount,
    })
    .from(schema.referrals)
    .innerJoin(schema.referralLinks, eq(schema.referralLinks.id, schema.referrals.referralLinkId))
    .where(eq(schema.referrals.organizationId, orgId))
    .orderBy(desc(schema.referrals.createdAt))
    .limit(200)
  return rows
})

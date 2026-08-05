import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const links = await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.organizationId, orgId)).orderBy(desc(schema.referralLinks.createdAt))
  const referrals = await db.select().from(schema.referrals).where(eq(schema.referrals.organizationId, orgId))
  const countByLink = new Map<number, number>()
  for (const r of referrals) countByLink.set(r.referralLinkId, (countByLink.get(r.referralLinkId) || 0) + 1)
  return links.map((l) => ({ ...l, referralCount: countByLink.get(l.id) || 0 }))
})

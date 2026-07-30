import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/**
 * GET /api/admin/scheduler/notifications — Fase 13. Real notifications the
 * dispatcher already writes (server/utils/publication/dispatcher.ts) on
 * job_success/job_retrying/job_failed — this is just the first place
 * anything reads them back.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const unreadOnly = String(getQuery(event).unread || '') === '1'

  const N = schema.publicationNotifications
  const conds = [eq(N.organizationId, orgId)]
  if (unreadOnly) conds.push(isNull(N.readAt))

  const rows = await db.select().from(N).where(and(...conds)).orderBy(desc(N.createdAt)).limit(100)
  const unreadCount = await db.select({ id: N.id }).from(N).where(and(eq(N.organizationId, orgId), isNull(N.readAt)))

  return { rows, unreadCount: unreadCount.length }
})

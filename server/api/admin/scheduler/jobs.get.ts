import { and, asc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/jobs — Fase 7/16. Filters: scheduleId, status, channelKey. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const db = useDb(event)

  const conds = [eq(schema.publicationJobs.organizationId, orgId)]
  if (q.scheduleId) conds.push(eq(schema.publicationJobs.scheduleId, Number(q.scheduleId)))
  if (q.status) conds.push(eq(schema.publicationJobs.status, String(q.status)))
  if (q.channelKey) conds.push(eq(schema.publicationJobs.channelKey, String(q.channelKey)))

  const rows = await db
    .select()
    .from(schema.publicationJobs)
    .where(and(...conds))
    .orderBy(asc(schema.publicationJobs.runAt))
    .limit(500)

  return { rows }
})

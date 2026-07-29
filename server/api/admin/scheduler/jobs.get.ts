import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/jobs — Fase 7/16. Filters: scheduleId, status, channelKey, from/to (run_at range, powers the calendar view). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const db = useDb(event)

  const conds = [eq(schema.publicationJobs.organizationId, orgId)]
  if (q.scheduleId) conds.push(eq(schema.publicationJobs.scheduleId, Number(q.scheduleId)))
  if (q.status) conds.push(eq(schema.publicationJobs.status, String(q.status)))
  if (q.channelKey) conds.push(eq(schema.publicationJobs.channelKey, String(q.channelKey)))
  if (q.from) conds.push(gte(schema.publicationJobs.runAt, String(q.from)))
  if (q.to) conds.push(lte(schema.publicationJobs.runAt, String(q.to)))

  const rows = await db
    .select({
      id: schema.publicationJobs.id,
      scheduleId: schema.publicationJobs.scheduleId,
      channelKey: schema.publicationJobs.channelKey,
      runAt: schema.publicationJobs.runAt,
      status: schema.publicationJobs.status,
      priority: schema.publicationJobs.priority,
      action: schema.publicationJobs.action,
      retryCount: schema.publicationJobs.retryCount,
      maxRetries: schema.publicationJobs.maxRetries,
      lastError: schema.publicationJobs.lastError,
      propertyName: schema.developerProperties.name,
      propertySlug: schema.developerProperties.slug,
    })
    .from(schema.publicationJobs)
    .leftJoin(schema.publicationSchedules, eq(schema.publicationSchedules.id, schema.publicationJobs.scheduleId))
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.publicationSchedules.developerPropertyId))
    .where(and(...conds))
    .orderBy(asc(schema.publicationJobs.runAt))
    .limit(1000)

  return { rows }
})

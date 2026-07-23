import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/schedules — list view + Fase 6 calendar feed (?from=&to= filters by base_scheduled_at). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = getQuery(event)
  const db = useDb(event)

  const conds = [eq(schema.publicationSchedules.organizationId, orgId)]
  if (q.status) conds.push(eq(schema.publicationSchedules.status, String(q.status)))
  if (q.from) conds.push(gte(schema.publicationSchedules.baseScheduledAt, String(q.from)))
  if (q.to) conds.push(lte(schema.publicationSchedules.baseScheduledAt, String(q.to)))

  const rows = await db
    .select({
      id: schema.publicationSchedules.id,
      developerPropertyId: schema.publicationSchedules.developerPropertyId,
      propertyName: schema.developerProperties.name,
      propertySlug: schema.developerProperties.slug,
      templateId: schema.publicationSchedules.templateId,
      name: schema.publicationSchedules.name,
      baseScheduledAt: schema.publicationSchedules.baseScheduledAt,
      timezone: schema.publicationSchedules.timezone,
      status: schema.publicationSchedules.status,
      createdAt: schema.publicationSchedules.createdAt,
    })
    .from(schema.publicationSchedules)
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.publicationSchedules.developerPropertyId))
    .where(and(...conds))
    .orderBy(desc(schema.publicationSchedules.baseScheduledAt))
    .limit(200)

  return { rows }
})

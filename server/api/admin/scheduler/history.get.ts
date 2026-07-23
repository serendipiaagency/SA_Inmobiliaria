import { and, asc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/history?scheduleId= — Fase 15/16. Chronological event feed for one property's schedule. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const scheduleId = Number(getQuery(event).scheduleId)
  if (!scheduleId) throw createError({ statusCode: 422, statusMessage: 'scheduleId es obligatorio' })

  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.publicationHistory)
    .where(and(eq(schema.publicationHistory.scheduleId, scheduleId), eq(schema.publicationHistory.organizationId, orgId)))
    .orderBy(asc(schema.publicationHistory.createdAt))

  return { rows }
})

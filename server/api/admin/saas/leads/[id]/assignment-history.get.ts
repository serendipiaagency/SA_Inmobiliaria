import { and, desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'

/** GET /api/admin/saas/leads/:id/assignment-history — explicabilidad (FASE 15 §21): quién tuvo el lead, cuándo, y por qué. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const rows = await db
    .select()
    .from(schema.leadAssignmentHistory)
    .where(and(eq(schema.leadAssignmentHistory.organizationId, orgId), eq(schema.leadAssignmentHistory.leadId, id)))
    .orderBy(desc(schema.leadAssignmentHistory.createdAt))

  return { rows }
})

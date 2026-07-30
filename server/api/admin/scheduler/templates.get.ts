import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

/** GET /api/admin/scheduler/templates — Fase 9 ("plantillas de publicación"). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.publicationTemplates).where(eq(schema.publicationTemplates.organizationId, orgId))
  return { rows: rows.map((r: any) => ({ ...r, steps: JSON.parse(r.stepsJson || '[]') })) }
})

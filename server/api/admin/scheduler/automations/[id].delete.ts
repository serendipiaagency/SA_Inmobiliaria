import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  await db.delete(schema.publicationAutomationRules).where(and(eq(schema.publicationAutomationRules.id, id), eq(schema.publicationAutomationRules.organizationId, orgId)))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'scheduler-automation', resourceId: id })
  return { ok: true }
})

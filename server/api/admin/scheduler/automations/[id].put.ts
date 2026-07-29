import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const where = and(eq(schema.publicationAutomationRules.id, id), eq(schema.publicationAutomationRules.organizationId, orgId))

  const db = useDb(event)
  const body = await readBody<{ enabled?: boolean; name?: string }>(event)
  const patch: Record<string, any> = {}
  if (body?.enabled !== undefined) patch.enabled = body.enabled ? 1 : 0
  if (body?.name !== undefined) patch.name = String(body.name).trim()
  if (Object.keys(patch).length) await db.update(schema.publicationAutomationRules).set(patch).where(where)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'scheduler-automation', resourceId: id })
  return { ok: true }
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const template = (await db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.id, id)).limit(1))[0]
  if (!template || template.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  await db.delete(schema.contractTemplates).where(eq(schema.contractTemplates.id, id))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'contract_template', resourceId: id })
  return { ok: true }
})

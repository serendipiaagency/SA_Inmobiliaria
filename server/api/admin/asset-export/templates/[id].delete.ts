import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const existing = (await db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, id)).limit(1))[0]
  if (!existing || existing.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  await db.delete(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, id))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'asset-export-template', resourceId: id })
  return { ok: true }
})

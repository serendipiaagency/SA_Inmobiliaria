import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

/** DELETE /api/admin/comms/templates/:id — quita la plantilla del panel (no la borra en el proveedor). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  const deleted = await db
    .delete(schema.commsTemplates)
    .where(and(eq(schema.commsTemplates.id, id), eq(schema.commsTemplates.organizationId, orgId)))
    .returning({ id: schema.commsTemplates.id })
  if (!deleted[0]) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'comms-template', resourceId: id })
  return { ok: true }
})

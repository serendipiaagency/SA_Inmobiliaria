import { and, eq, isNull } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { updateAutomation } from '../../../../utils/automations/service'

/**
 * Activar / desactivar una automatización (compatibilidad; el panel usa
 * PUT /api/admin/automations/:id). Mismas reglas que allí: de la agencia
 * (404 si no), una demo heredada no se activa (422), y activar exige poder
 * ejecutar su acción.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody(event)
  const db = useDb(event)
  const [existing] = await db
    .select()
    .from(schema.automations)
    .where(and(eq(schema.automations.id, id), eq(schema.automations.organizationId, orgId), isNull(schema.automations.deletedAt)))
    .limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const row = await updateAutomation(db, orgId, user, existing, { enabled: Boolean(body?.enabled) })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'automations', resourceId: id, detail: row.enabled ? 'activa' : 'desactivada' })
  return { ok: true, id, enabled: row.enabled }
})

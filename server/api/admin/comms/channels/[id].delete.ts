import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

/**
 * DELETE /api/admin/comms/channels/:id — desconecta el número. Las
 * conversaciones y mensajes se conservan (son historial de la agencia);
 * sólo se borran la fila del canal y sus plantillas, y los hilos quedan sin
 * canal activo hasta que se conecte otro número.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  const rows = await db
    .select({ id: schema.commsChannels.id })
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.id, id), eq(schema.commsChannels.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  await db.delete(schema.commsTemplates).where(and(eq(schema.commsTemplates.channelId, id), eq(schema.commsTemplates.organizationId, orgId)))
  await db.delete(schema.commsChannels).where(eq(schema.commsChannels.id, id))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'comms-channel', resourceId: id })
  return { ok: true }
})

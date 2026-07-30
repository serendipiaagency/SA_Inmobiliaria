import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../../utils/db'
import { requireOrgScope } from '../../../../../../utils/auth'
import { logAdminAction } from '../../../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const agentId = Number(getRouterParam(event, 'id'))
  const timeOffId = Number(getRouterParam(event, 'timeOffId'))
  if (!Number.isFinite(agentId) || !Number.isFinite(timeOffId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const rows = await db
    .select({ id: schema.agentTimeOff.id })
    .from(schema.agentTimeOff)
    .where(and(eq(schema.agentTimeOff.id, timeOffId), eq(schema.agentTimeOff.agentId, agentId), eq(schema.agentTimeOff.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Bloqueo no encontrado' })

  await db.delete(schema.agentTimeOff).where(eq(schema.agentTimeOff.id, timeOffId))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'agent-time-off', resourceId: timeOffId })
  return { ok: true }
})

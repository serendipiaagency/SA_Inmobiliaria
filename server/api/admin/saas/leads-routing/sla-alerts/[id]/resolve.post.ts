import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../../utils/db'
import { logAdminAction } from '../../../../../../utils/audit'

/** POST /api/admin/saas/leads-routing/sla-alerts/:id/resolve — resolución manual (p.ej. "ya lo he mirado, la regla no aplica hoy"). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const existing = (await db.select({ id: schema.leadSlaAlerts.id }).from(schema.leadSlaAlerts).where(and(eq(schema.leadSlaAlerts.id, id), eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.status, 'open'))).limit(1))[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Alerta no encontrada o ya resuelta' })

  await db.update(schema.leadSlaAlerts).set({ status: 'resolved', resolvedAt: now(), resolvedReason: 'manual' }).where(eq(schema.leadSlaAlerts.id, id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead-sla-alert', resourceId: id, detail: 'resuelta manualmente' })
  return { ok: true }
})

import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { reassignLead, LeadRoutingError } from '../../../../../utils/leads/routing'

interface Body {
  commercialId?: number | null
  reason?: string | null
}

/**
 * POST /api/admin/saas/leads/:id/reassign — reasignación manual (FASE 15
 * §22). `commercialId: null` deja el lead explícitamente sin asignar
 * (nunca lo confunde con "no se ha tocado").
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = (await readBody<Body>(event)) || {}

  const db = useDb(event)
  if (body.commercialId) {
    const tm = (await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, body.commercialId), eq(schema.teamMembers.organizationId, orgId))).limit(1))[0]
    if (!tm) throw createError({ statusCode: 422, statusMessage: 'Comercial no encontrado en esta organización' })
  }

  try {
    await reassignLead(event, orgId, id, body.commercialId ?? null, { userId: user.id, reason: body.reason || undefined })
  } catch (err) {
    if (err instanceof LeadRoutingError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: `reasignado a comercial #${body.commercialId ?? 'ninguno'}` })
  return (await db.select().from(schema.leads).where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId))).limit(1))[0]
})

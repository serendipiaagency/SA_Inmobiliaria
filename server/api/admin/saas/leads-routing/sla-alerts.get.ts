import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { and, eq, desc } from 'drizzle-orm'

/** GET /api/admin/saas/leads-routing/sla-alerts — alertas abiertas, con el nombre y la fase del lead para poder actuar sin abrir cada ficha. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const rows = await db
    .select({
      id: schema.leadSlaAlerts.id,
      leadId: schema.leadSlaAlerts.leadId,
      type: schema.leadSlaAlerts.type,
      openedAt: schema.leadSlaAlerts.openedAt,
      leadName: schema.leads.name,
      leadStage: schema.leads.stage,
      leadAgentName: schema.leads.agentName,
    })
    .from(schema.leadSlaAlerts)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.leadSlaAlerts.leadId))
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.status, 'open')))
    .orderBy(desc(schema.leadSlaAlerts.openedAt))
    .limit(200)

  return { rows }
})

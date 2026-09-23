import { and, asc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { STRATEGIES, STRATEGY_LABELS } from '../../../../utils/leads/routing'

/** Las reglas de asignación de la organización, en el orden en que se evalúan. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const rules = await db
    .select()
    .from(schema.leadRoutingRules)
    .where(eq(schema.leadRoutingRules.organizationId, orgId))
    .orderBy(asc(schema.leadRoutingRules.priority), asc(schema.leadRoutingRules.id))

  const commercials = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, officeName: schema.teamMembers.officeName })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.employmentStatus, 'active')))
    .orderBy(asc(schema.teamMembers.name))

  return { rules, commercials, strategies: STRATEGIES.map((key) => ({ key, label: STRATEGY_LABELS[key] })) }
})

import { and, eq, ne, sql } from 'drizzle-orm'
import { schema, useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getResource } from '../../../../utils/adminResources'
import { authorizeRecord } from '../../../../utils/tenantPolicy'

/**
 * Real, derived-only metrics for a Comercial's "Rendimiento" tab — every
 * number here comes from an existing table filtered by agentId, never a
 * fabricated figure. `clients` has no agentId FK (only a denormalized
 * agentName string), so it's excluded rather than matched unreliably by
 * name. Only implemented for `team`, same 404-for-everything-else pattern
 * as duplicate.post.ts.
 */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (key !== 'team') throw createError({ statusCode: 404, statusMessage: 'Performance is not supported for this resource' })

  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  const [leadsTotal, leadsActive, visitsTotal, visitsCompleted, dealsRows, devPropsCount, agentPropsCount] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.agentId, id))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.agentId, id), ne(schema.leads.status, 'won'), ne(schema.leads.status, 'lost'))),
    db.select({ c: sql<number>`count(*)` }).from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.agentId, id))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.visits)
      .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.agentId, id), eq(schema.visits.status, 'completed'))),
    db
      .select({ dealValue: schema.deals.dealValue, commissionAmount: schema.deals.commissionAmount })
      .from(schema.deals)
      .where(and(eq(schema.deals.organizationId, orgId), eq(schema.deals.agentId, id))),
    db.select({ c: sql<number>`count(*)` }).from(schema.developerProperties).where(and(eq(schema.developerProperties.organizationId, orgId), eq(schema.developerProperties.agentId, id))),
    db.select({ c: sql<number>`count(*)` }).from(schema.agentProperties).where(and(eq(schema.agentProperties.organizationId, orgId), eq(schema.agentProperties.agentId, id))),
  ])

  return {
    leadsAssigned: leadsTotal[0]?.c ?? 0,
    leadsActive: leadsActive[0]?.c ?? 0,
    visitsTotal: visitsTotal[0]?.c ?? 0,
    visitsCompleted: visitsCompleted[0]?.c ?? 0,
    dealsClosed: dealsRows.length,
    commercialVolume: dealsRows.reduce((sum, d) => sum + (d.dealValue || 0), 0),
    commissionTotal: dealsRows.reduce((sum, d) => sum + (d.commissionAmount || 0), 0),
    assignedProperties: (devPropsCount[0]?.c ?? 0) + (agentPropsCount[0]?.c ?? 0),
  }
})

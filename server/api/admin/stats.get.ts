import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireOrgScope } from '../../utils/auth'

/**
 * Dashboard counters. Every count is confined to the caller's own
 * organization: these used to be unfiltered `count(*)` queries under a plain
 * `requireAdmin`, so each tenant's dashboard reported the whole platform's
 * catalog and inbox volume — a real (if aggregate) cross-tenant disclosure,
 * and misleading numbers on top of it.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  async function count(table: any): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.organizationId, orgId))
    return rows[0]?.count ?? 0
  }

  const [projects, properties, developersCount, agentsCount, communitiesCount, blogsCount, visitors, vendors, messages] =
    await Promise.all([
      count(schema.developerProperties),
      count(schema.agentProperties),
      count(schema.developers),
      count(schema.agents),
      count(schema.communities),
      count(schema.blogs),
      count(schema.visitorSubmissions),
      count(schema.information),
      count(schema.contactMessages),
    ])

  return { projects, properties, developers: developersCount, agents: agentsCount, communities: communitiesCount, blogs: blogsCount, visitors, vendors, messages }
})

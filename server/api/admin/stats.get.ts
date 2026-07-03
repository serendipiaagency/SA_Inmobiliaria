import { sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb(event)

  async function count(table: any): Promise<number> {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(table)
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

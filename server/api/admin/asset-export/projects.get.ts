import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Lists the active org's export projects, optionally filtered to one asset (?assetKind=&assetId=). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const query = getQuery(event)
  const db = useDb(event)

  const conds = [eq(schema.assetExportProjects.organizationId, orgId)]
  if (query.assetKind) conds.push(eq(schema.assetExportProjects.assetKind, String(query.assetKind)))
  if (query.assetId) conds.push(eq(schema.assetExportProjects.assetId, Number(query.assetId)))

  const projects = await db
    .select()
    .from(schema.assetExportProjects)
    .where(and(...conds))
    .orderBy(desc(schema.assetExportProjects.updatedAt))
    .limit(100)

  // One extra query for the whole page instead of N+1 per-row lookups —
  // developer_properties is the only supported assetKind today (see
  // resolveAssetBindings), so a single IN-list covers every row.
  const propertyIds = [...new Set(projects.filter((p) => p.assetKind === 'developer_property').map((p) => p.assetId))]
  const prices = new Map<number, number | null>()
  if (propertyIds.length) {
    const rows = await db
      .select({ id: schema.developerProperties.id, price: schema.developerProperties.price })
      .from(schema.developerProperties)
      .where(inArray(schema.developerProperties.id, propertyIds))
    for (const r of rows) prices.set(r.id, r.price)
  }

  return projects.map((p) => {
    const currentPrice = prices.get(p.assetId) ?? null
    return { ...p, currentPrice, priceChanged: p.priceAtCreation != null && currentPrice != null && currentPrice !== p.priceAtCreation }
  })
})

import { and, desc, eq } from 'drizzle-orm'
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

  return db
    .select()
    .from(schema.assetExportProjects)
    .where(and(...conds))
    .orderBy(desc(schema.assetExportProjects.updatedAt))
    .limit(100)
})

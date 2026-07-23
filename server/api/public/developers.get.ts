import { and, desc, eq, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select({
      developer: schema.developers,
      projectCount: sql<number>`(select count(*) from developer_properties dp where dp.developer_id = ${schema.developers.id})`,
    })
    .from(schema.developers)
    .where(and(eq(schema.developers.status, 'active'), eq(schema.developers.organizationId, resolvePublicOrgId(event))))
    .orderBy(desc(schema.developers.id))
  return { rows: rows.map((r) => ({ ...r.developer, projectCount: r.projectCount })) }
})

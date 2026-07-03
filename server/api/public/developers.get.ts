import { desc, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select({
      developer: schema.developers,
      projectCount: sql<number>`(select count(*) from developer_properties dp where dp.developer_id = ${schema.developers.id})`,
    })
    .from(schema.developers)
    .where(eq(schema.developers.status, 'active'))
    .orderBy(desc(schema.developers.id))
  return { rows: rows.map((r) => ({ ...r.developer, projectCount: r.projectCount })) }
})

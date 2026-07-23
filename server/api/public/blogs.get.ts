import { desc, eq, inArray } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const locale = String(query.locale || 'en')

  const rows = await db
    .select()
    .from(schema.blogs)
    .where(eq(schema.blogs.organizationId, resolvePublicOrgId(event)))
    .orderBy(desc(schema.blogs.id))
    .limit(50)
  const ids = rows.map((b) => b.id)
  const trs = ids.length
    ? await db.select().from(schema.blogTranslations).where(inArray(schema.blogTranslations.blogId, ids))
    : []

  const byBlog: Record<number, { title: string; description: string }> = {}
  for (const tr of trs) {
    if (tr.locale === locale || !byBlog[tr.blogId]) {
      byBlog[tr.blogId] = { title: tr.title, description: tr.description }
    }
  }
  return { rows: rows.map((b) => ({ ...b, ...byBlog[b.id] })) }
})

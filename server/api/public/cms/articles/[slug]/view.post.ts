import { and, eq, isNull, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const A = schema.cmsArticles
  const where = and(eq(A.slug, slug), eq(A.organizationId, resolvePublicOrgId(event)), eq(A.status, 'published'), isNull(A.deletedAt))
  const rows = await db.select({ id: A.id }).from(A).where(where).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  await db.update(A).set({ viewCount: sql`${A.viewCount} + 1` }).where(eq(A.id, rows[0].id))
  return { ok: true }
})

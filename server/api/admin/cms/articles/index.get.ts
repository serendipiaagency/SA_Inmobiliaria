import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

/** List articles for the current org. Excludes soft-deleted rows unless trashed=1 (Papelera). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.perPage || '20'), 10) || 20))
  const q = String(query.q || '').trim()
  const status = String(query.status || '')
  const trashed = String(query.trashed || '') === '1'

  const A = schema.cmsArticles
  const conds = [eq(A.organizationId, orgId), trashed ? sql`${A.deletedAt} is not null` : isNull(A.deletedAt)]
  if (status && status !== 'all') conds.push(eq(A.status, status))
  if (q) conds.push(or(like(A.title, `%${q}%`), like(A.slug, `%${q}%`)) as any)
  const where = and(...conds)

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(A).where(where)
  const total = countRows[0]?.count ?? 0

  const rows = await db
    .select({
      id: A.id,
      title: A.title,
      slug: A.slug,
      status: A.status,
      coverImage: A.coverImage,
      authorId: A.authorId,
      categoryId: A.categoryId,
      language: A.language,
      readingTimeMinutes: A.readingTimeMinutes,
      viewCount: A.viewCount,
      commentCount: A.commentCount,
      seoScore: A.seoScore,
      publishedAt: A.publishedAt,
      scheduledAt: A.scheduledAt,
      createdAt: A.createdAt,
      updatedAt: A.updatedAt,
      authorName: schema.cmsAuthors.name,
      categoryName: schema.cmsCategories.name,
    })
    .from(A)
    .leftJoin(schema.cmsAuthors, eq(A.authorId, schema.cmsAuthors.id))
    .leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id))
    .where(where)
    .orderBy(desc(A.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return { rows, total, page, perPage }
})

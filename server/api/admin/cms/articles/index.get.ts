import { and, asc, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

const SORTABLE: Record<string, any> = {
  title: schema.cmsArticles.title,
  updatedAt: schema.cmsArticles.updatedAt,
  createdAt: schema.cmsArticles.createdAt,
  viewCount: schema.cmsArticles.viewCount,
  seoScore: schema.cmsArticles.seoScore,
  status: schema.cmsArticles.status,
}

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
  const categoryId = parseInt(String(query.categoryId || ''), 10)
  const authorId = parseInt(String(query.authorId || ''), 10)
  const language = String(query.language || '')
  const sortKey = String(query.sort || 'updatedAt')
  const sortDir = String(query.dir || 'desc') === 'asc' ? asc : desc

  const A = schema.cmsArticles
  const conds = [eq(A.organizationId, orgId), trashed ? sql`${A.deletedAt} is not null` : isNull(A.deletedAt)]
  if (status && status !== 'all') conds.push(eq(A.status, status))
  if (q) conds.push(or(like(A.title, `%${q}%`), like(A.slug, `%${q}%`)) as any)
  if (Number.isInteger(categoryId)) conds.push(eq(A.categoryId, categoryId))
  if (Number.isInteger(authorId)) conds.push(eq(A.authorId, authorId))
  if (language && language !== 'all') conds.push(eq(A.language, language))
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
    .orderBy(sortDir(SORTABLE[sortKey] || A.updatedAt), desc(A.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return { rows, total, page, perPage }
})

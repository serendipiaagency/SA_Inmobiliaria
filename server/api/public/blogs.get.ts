import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

/**
 * Merges the new Blog & CMS articles with the legacy `blogs` table into one
 * public listing shape, so new editorial content shows up on the live site
 * without a breaking migration of the old posts. Legacy rows keep their
 * `source: 'legacy'` tag; CMS rows are tagged `source: 'cms'` — the detail
 * page (`/blog/[slug]`) uses that to pick the right renderer.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const locale = String(query.locale || 'en')
  const orgId = resolvePublicOrgId(event)

  const legacyRows = await db
    .select()
    .from(schema.blogs)
    .where(eq(schema.blogs.organizationId, orgId))
    .orderBy(desc(schema.blogs.id))
    .limit(50)
  const ids = legacyRows.map((b) => b.id)
  const trs = ids.length
    ? await db.select().from(schema.blogTranslations).where(inArray(schema.blogTranslations.blogId, ids))
    : []
  const byBlog: Record<number, { title: string; description: string }> = {}
  for (const tr of trs) {
    if (tr.locale === locale || !byBlog[tr.blogId]) {
      byBlog[tr.blogId] = { title: tr.title, description: tr.description }
    }
  }
  const legacy = legacyRows.map((b) => ({
    source: 'legacy' as const,
    id: `legacy-${b.id}`,
    slug: b.slug,
    image: b.image,
    title: byBlog[b.id]?.title || b.slug,
    description: byBlog[b.id]?.description || '',
    targetAudience: b.targetAudience,
    createdAt: b.createdAt,
  }))

  const A = schema.cmsArticles
  const cmsRows = await db
    .select({
      id: A.id, slug: A.slug, title: A.title, excerpt: A.excerpt, coverImage: A.coverImage,
      createdAt: A.createdAt, publishedAt: A.publishedAt, authorName: schema.cmsAuthors.name, categoryName: schema.cmsCategories.name,
    })
    .from(A)
    .leftJoin(schema.cmsAuthors, eq(A.authorId, schema.cmsAuthors.id))
    .leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id))
    .where(and(eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt)))
    .orderBy(desc(A.publishedAt))
    .limit(50)
  const cms = cmsRows.map((a) => ({
    source: 'cms' as const,
    id: `cms-${a.id}`,
    slug: a.slug,
    image: a.coverImage,
    title: a.title,
    description: a.excerpt || '',
    targetAudience: a.categoryName || a.authorName || 'Blog',
    createdAt: a.publishedAt || a.createdAt,
  }))

  const rows = [...legacy, ...cms].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return { rows }
})

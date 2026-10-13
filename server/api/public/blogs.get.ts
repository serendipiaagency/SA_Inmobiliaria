import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { ensureBuyerGuides } from '../../utils/blog/buyerGuides'

/**
 * Merges the new Blog & CMS articles with the legacy `blogs` table into one
 * public listing shape, so new editorial content shows up on the live site
 * without a breaking migration of the old posts. Legacy rows keep their
 * `source: 'legacy'` tag; CMS rows are tagged `source: 'cms'` — the detail
 * page (`/blog/[slug]`) uses that to pick the right renderer.
 *
 * Cada fila lleva además el tiempo de lectura, la categoría (nombre y slug)
 * y la fecha de publicación, y `?categoria=<slug>` filtra los artículos del
 * CMS por categoría (los antiguos no tienen categoría y se omiten al filtrar).
 * `categories` enumera las categorías con artículos publicados, para los
 * filtros del listado. En el host principal, las guías de compra se publican
 * aquí de forma perezosa (server/utils/blog/buyerGuides.ts).
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const locale = String(query.locale || 'en')
  const categoria = String(query.categoria || '').trim() || null
  const orgId = resolvePublicOrgId(event)
  await ensureBuyerGuides(db, orgId)

  const legacyRows = categoria
    ? []
    : await db
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
    publishedAt: b.createdAt,
    readingTime: 0,
    category: null as { name: string; slug: string } | null,
  }))

  const A = schema.cmsArticles
  const cmsRows = await db
    .select({
      id: A.id, slug: A.slug, title: A.title, excerpt: A.excerpt, coverImage: A.coverImage, readingTime: A.readingTimeMinutes,
      createdAt: A.createdAt, publishedAt: A.publishedAt, updatedAt: A.updatedAt, authorName: schema.cmsAuthors.name,
      categoryName: schema.cmsCategories.name, categorySlug: schema.cmsCategories.slug,
    })
    .from(A)
    .leftJoin(schema.cmsAuthors, eq(A.authorId, schema.cmsAuthors.id))
    .leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id))
    .where(and(eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt)))
    .orderBy(desc(A.publishedAt))
    .limit(50)
  const categoryCounts = new Map<string, { name: string; slug: string; count: number }>()
  for (const a of cmsRows) {
    if (!a.categorySlug || !a.categoryName) continue
    const c = categoryCounts.get(a.categorySlug) || { name: a.categoryName, slug: a.categorySlug, count: 0 }
    c.count++
    categoryCounts.set(a.categorySlug, c)
  }
  const cms = cmsRows
    .filter((a) => !categoria || a.categorySlug === categoria)
    .map((a) => ({
      source: 'cms' as const,
      id: `cms-${a.id}`,
      slug: a.slug,
      image: a.coverImage,
      title: a.title,
      description: a.excerpt || '',
      targetAudience: a.categoryName || a.authorName || 'Blog',
      createdAt: a.publishedAt || a.createdAt,
      publishedAt: a.publishedAt || a.createdAt,
      updatedAt: a.updatedAt,
      readingTime: a.readingTime || 0,
      category: a.categorySlug && a.categoryName ? { name: a.categoryName, slug: a.categorySlug } : null,
    }))

  const rows = [...legacy, ...cms].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return { rows, categories: [...categoryCounts.values()].sort((a, b) => a.name.localeCompare(b.name)), categoria }
})

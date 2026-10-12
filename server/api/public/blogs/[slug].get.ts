import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { ensureBuyerGuides } from '../../../utils/blog/buyerGuides'
import { guiaBySlug } from '../../../content/guiasCompra'

/**
 * Un artículo del blog por slug: primero el CMS (artículos publicados, con
 * autor, categoría, etiquetas y hasta tres relacionados), después la tabla
 * `blogs` antigua. Los relacionados son los que declara la guía (si el
 * artículo es una de las guías de compra) y, si faltan, los últimos
 * publicados de la misma categoría o del blog.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  await ensureBuyerGuides(db, orgId)

  const A = schema.cmsArticles
  const cmsRows = await db
    .select()
    .from(A)
    .where(and(eq(A.organizationId, orgId), eq(A.slug, slug), eq(A.status, 'published'), isNull(A.deletedAt)))
    .limit(1)
  if (cmsRows[0]) {
    const article = cmsRows[0]
    const [author, category, tagLinks] = await Promise.all([
      article.authorId
        ? db.select().from(schema.cmsAuthors).where(eq(schema.cmsAuthors.id, article.authorId)).limit(1)
        : Promise.resolve([]),
      article.categoryId
        ? db.select().from(schema.cmsCategories).where(eq(schema.cmsCategories.id, article.categoryId)).limit(1)
        : Promise.resolve([]),
      db
        .select({ name: schema.cmsTags.name, slug: schema.cmsTags.slug })
        .from(schema.cmsArticleTags)
        .innerJoin(schema.cmsTags, eq(schema.cmsArticleTags.tagId, schema.cmsTags.id))
        .where(eq(schema.cmsArticleTags.articleId, article.id)),
    ])

    const related = await relatedArticles(db, orgId, article, guiaBySlug(slug)?.related || [])
    return { source: 'cms' as const, article, author: author[0] || null, category: category[0] || null, tags: tagLinks, related }
  }

  const legacyRows = await db
    .select()
    .from(schema.blogs)
    .where(and(eq(schema.blogs.slug, slug), eq(schema.blogs.organizationId, orgId)))
    .limit(1)
  const blog = legacyRows[0]
  if (!blog) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })
  const translations = await db.select().from(schema.blogTranslations).where(eq(schema.blogTranslations.blogId, blog.id))
  return { source: 'legacy' as const, blog, translations }
})

async function relatedArticles(db: any, orgId: number, article: { id: number; categoryId: number | null }, preferredSlugs: string[]) {
  const A = schema.cmsArticles
  const fields = {
    id: A.id, slug: A.slug, title: A.title, excerpt: A.excerpt, coverImage: A.coverImage, readingTime: A.readingTimeMinutes, publishedAt: A.publishedAt,
    categoryName: schema.cmsCategories.name, categorySlug: schema.cmsCategories.slug,
  }
  const base = and(eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt), ne(A.id, article.id))
  const out: any[] = []
  if (preferredSlugs.length) {
    const rows = await db.select(fields).from(A).leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id)).where(and(base, inArray(A.slug, preferredSlugs)))
    for (const s of preferredSlugs) {
      const r = rows.find((x: any) => x.slug === s)
      if (r) out.push(r)
    }
  }
  if (out.length < 3) {
    const rows = await db
      .select(fields)
      .from(A)
      .leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id))
      .where(article.categoryId ? and(base, eq(A.categoryId, article.categoryId)) : base)
      .orderBy(desc(A.publishedAt))
      .limit(6)
    for (const r of rows) if (out.length < 3 && !out.some((x) => x.id === r.id)) out.push(r)
  }
  if (out.length < 3) {
    const rows = await db.select(fields).from(A).leftJoin(schema.cmsCategories, eq(A.categoryId, schema.cmsCategories.id)).where(base).orderBy(desc(A.publishedAt)).limit(6)
    for (const r of rows) if (out.length < 3 && !out.some((x) => x.id === r.id)) out.push(r)
  }
  return out.slice(0, 3)
}

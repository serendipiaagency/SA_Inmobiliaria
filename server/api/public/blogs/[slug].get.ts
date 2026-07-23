import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

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
    return { source: 'cms' as const, article, author: author[0] || null, category: category[0] || null, tags: tagLinks }
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

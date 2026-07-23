import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

  const rows = await db
    .select()
    .from(schema.cmsAuthors)
    .where(and(eq(schema.cmsAuthors.slug, slug), eq(schema.cmsAuthors.organizationId, orgId)))
    .limit(1)
  const author = rows[0]
  if (!author) throw createError({ statusCode: 404, statusMessage: 'Author not found' })

  const A = schema.cmsArticles
  const articles = await db
    .select({ id: A.id, slug: A.slug, title: A.title, excerpt: A.excerpt, coverImage: A.coverImage, publishedAt: A.publishedAt, readingTimeMinutes: A.readingTimeMinutes })
    .from(A)
    .where(and(eq(A.authorId, author.id), eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt)))
    .orderBy(desc(A.publishedAt))
    .limit(24)

  return { author, articles }
})

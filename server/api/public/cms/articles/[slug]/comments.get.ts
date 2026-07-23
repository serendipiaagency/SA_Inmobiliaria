import { and, asc, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../../utils/db'

/** Approved comments for a published article, oldest first — parentId lets the client nest replies. */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

  const A = schema.cmsArticles
  const rows = await db
    .select({ id: A.id })
    .from(A)
    .where(and(eq(A.slug, slug), eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Article not found' })

  const comments = await db
    .select({
      id: schema.cmsComments.id,
      parentId: schema.cmsComments.parentId,
      authorName: schema.cmsComments.authorName,
      content: schema.cmsComments.content,
      createdAt: schema.cmsComments.createdAt,
    })
    .from(schema.cmsComments)
    .where(and(eq(schema.cmsComments.articleId, rows[0].id), eq(schema.cmsComments.status, 'approved')))
    .orderBy(asc(schema.cmsComments.createdAt))

  return { rows: comments }
})

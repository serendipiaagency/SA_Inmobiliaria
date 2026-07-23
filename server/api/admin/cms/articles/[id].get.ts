import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const rows = await db
    .select()
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
    .limit(1)
  const article = rows[0]
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const tagLinks = await db
    .select({ tagId: schema.cmsArticleTags.tagId, name: schema.cmsTags.name, slug: schema.cmsTags.slug })
    .from(schema.cmsArticleTags)
    .innerJoin(schema.cmsTags, eq(schema.cmsArticleTags.tagId, schema.cmsTags.id))
    .where(eq(schema.cmsArticleTags.articleId, id))

  return { article, tags: tagLinks }
})

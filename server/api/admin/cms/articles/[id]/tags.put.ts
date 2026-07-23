import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

/** Replaces an article's tag set. Body: { tagIds: number[] } */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const owned = await db
    .select({ id: schema.cmsArticles.id })
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
    .limit(1)
  if (!owned[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{ tagIds?: number[] }>(event)
  const tagIds = Array.isArray(body?.tagIds) ? body.tagIds.map(Number).filter(Number.isInteger) : []

  // Only accept tags that actually belong to this org — otherwise an org admin
  // could tag their article with another org's tag id.
  const validTags = tagIds.length
    ? await db
        .select({ id: schema.cmsTags.id })
        .from(schema.cmsTags)
        .where(and(eq(schema.cmsTags.organizationId, orgId)))
    : []
  const validIds = new Set(validTags.map((t) => t.id))
  const safeTagIds = tagIds.filter((t) => validIds.has(t))

  await db.delete(schema.cmsArticleTags).where(eq(schema.cmsArticleTags.articleId, id))
  for (const tagId of safeTagIds) {
    await db.insert(schema.cmsArticleTags).values({ articleId: id, tagId })
  }
  return { ok: true, tagIds: safeTagIds }
})

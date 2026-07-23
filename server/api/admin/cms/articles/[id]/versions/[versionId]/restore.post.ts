import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../../../../utils/db'
import { requireOrgScope } from '../../../../../../../utils/auth'
import { parseBlocks, blocksToPlainText, computeReadingTime, computeSeoScore, countLinks } from '../../../../../../../utils/cms'

/** Reverts an article's title/content to a past version — itself saved as a new version, never lost history. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  const versionId = parseInt(getRouterParam(event, 'versionId') || '', 10)
  if (!id || !versionId) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const article = await db
    .select()
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
    .limit(1)
  if (!article[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const version = await db
    .select()
    .from(schema.cmsArticleVersions)
    .where(and(eq(schema.cmsArticleVersions.id, versionId), eq(schema.cmsArticleVersions.articleId, id)))
    .limit(1)
  if (!version[0]) throw createError({ statusCode: 404, statusMessage: 'Version not found' })

  const { title, contentJson } = version[0]
  const blocks = parseBlocks(contentJson)
  const plainText = blocksToPlainText(blocks)
  const nowTs = now()
  const seoScore = computeSeoScore({
    title,
    slug: article[0].slug,
    excerpt: article[0].excerpt,
    seoTitle: article[0].seoTitle,
    seoDescription: article[0].seoDescription,
    focusKeyword: article[0].focusKeyword,
    coverImage: article[0].coverImage,
    plainText,
    links: countLinks(blocks),
  })

  await db
    .update(schema.cmsArticles)
    .set({ title, contentJson, readingTimeMinutes: computeReadingTime(blocks), seoScore, updatedAt: nowTs })
    .where(eq(schema.cmsArticles.id, id))

  await db.insert(schema.cmsArticleVersions).values({ articleId: id, title, contentJson, editedBy: user.id, createdAt: nowTs })

  return { ok: true }
})

import { and, eq } from 'drizzle-orm'
import { useDb, schema, now, slugify } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { parseBlocks, blocksToPlainText, computeReadingTime, computeSeoScore } from '../../../../utils/cms'

export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const where = and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId))

  const current = await db.select().from(schema.cmsArticles).where(where).limit(1)
  const existing = current[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<Record<string, any>>(event)
  const title = body?.title !== undefined ? String(body.title).trim() || existing.title : existing.title

  let slug = existing.slug
  if (body?.slug !== undefined) {
    const nextSlug = slugify(String(body.slug || title))
    if (nextSlug !== existing.slug) {
      const collision = await db
        .select({ id: schema.cmsArticles.id })
        .from(schema.cmsArticles)
        .where(and(eq(schema.cmsArticles.organizationId, orgId), eq(schema.cmsArticles.slug, nextSlug)))
        .limit(1)
      slug = collision[0] && collision[0].id !== id ? `${nextSlug}-${Math.floor(Math.random() * 10000)}` : nextSlug
    }
  }

  const contentJson = body?.contentJson !== undefined
    ? typeof body.contentJson === 'string' ? body.contentJson : JSON.stringify(body.contentJson)
    : existing.contentJson
  const blocks = parseBlocks(contentJson)
  const plainText = blocksToPlainText(blocks)
  const nowTs = now()

  const status = body?.status && ['draft', 'scheduled', 'published'].includes(body.status) ? body.status : existing.status
  const wasPublished = existing.status === 'published'
  const excerpt = body?.excerpt !== undefined ? body.excerpt : existing.excerpt
  const seoTitle = body?.seoTitle !== undefined ? body.seoTitle : existing.seoTitle
  const seoDescription = body?.seoDescription !== undefined ? body.seoDescription : existing.seoDescription
  const focusKeyword = body?.focusKeyword !== undefined ? body.focusKeyword : existing.focusKeyword
  const coverImage = body?.coverImage !== undefined ? body.coverImage : existing.coverImage

  const seoScore = computeSeoScore({ title, slug, excerpt, seoTitle, seoDescription, focusKeyword, coverImage, plainText })

  await db
    .update(schema.cmsArticles)
    .set({
      title,
      slug,
      excerpt,
      contentJson,
      coverImage,
      authorId: body?.authorId !== undefined ? (body.authorId ? Number(body.authorId) : null) : existing.authorId,
      categoryId: body?.categoryId !== undefined ? (body.categoryId ? Number(body.categoryId) : null) : existing.categoryId,
      language: body?.language || existing.language,
      status,
      publishedAt: status === 'published' && !wasPublished ? nowTs : existing.publishedAt,
      scheduledAt: status === 'scheduled' ? body?.scheduledAt ?? existing.scheduledAt : null,
      readingTimeMinutes: computeReadingTime(blocks),
      seoTitle,
      seoDescription,
      seoCanonical: body?.seoCanonical !== undefined ? body.seoCanonical : existing.seoCanonical,
      focusKeyword,
      seoScore,
      updatedAt: nowTs,
    })
    .where(where)

  // Snapshot every save — powers version history / restore (Fase 7 builds the UI on top of this).
  await db.insert(schema.cmsArticleVersions).values({ articleId: id, title, contentJson, editedBy: user.id, createdAt: nowTs })

  return { ok: true, id, slug }
})

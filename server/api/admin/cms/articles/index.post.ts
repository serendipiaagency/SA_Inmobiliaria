import { and, eq } from 'drizzle-orm'
import { useDb, schema, now, slugify } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { parseBlocks, blocksToPlainText, computeReadingTime, computeSeoScore, countLinks } from '../../../../utils/cms'

export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const title = String(body?.title || '').trim()
  if (!title) throw createError({ statusCode: 422, statusMessage: 'El título es obligatorio' })

  let slug = slugify(String(body?.slug || title))
  // Slugs are unique per org (cms_articles_org_slug) — append a short suffix on collision
  // instead of failing the request, same convention as adminResources.slugFrom.
  const existing = await db
    .select({ id: schema.cmsArticles.id })
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.organizationId, orgId), eq(schema.cmsArticles.slug, slug)))
    .limit(1)
  if (existing[0]) slug = `${slug}-${Math.floor(Math.random() * 10000)}`

  const contentJson = typeof body?.contentJson === 'string' ? body.contentJson : JSON.stringify(body?.contentJson || [])
  const blocks = parseBlocks(contentJson)
  const plainText = blocksToPlainText(blocks)
  const nowTs = now()

  const status = ['draft', 'scheduled', 'published'].includes(body?.status) ? body.status : 'draft'
  const seoScore = computeSeoScore({
    title,
    slug,
    excerpt: body?.excerpt,
    seoTitle: body?.seoTitle,
    seoDescription: body?.seoDescription,
    focusKeyword: body?.focusKeyword,
    coverImage: body?.coverImage,
    plainText,
    links: countLinks(blocks),
  })

  const inserted = await db
    .insert(schema.cmsArticles)
    .values({
      organizationId: orgId,
      authorId: body?.authorId ? Number(body.authorId) : null,
      categoryId: body?.categoryId ? Number(body.categoryId) : null,
      title,
      slug,
      excerpt: body?.excerpt || null,
      contentJson,
      coverImage: body?.coverImage || null,
      language: body?.language || 'es',
      status,
      publishedAt: status === 'published' ? nowTs : null,
      scheduledAt: status === 'scheduled' ? body?.scheduledAt || null : null,
      expiresAt: body?.expiresAt || null,
      readingTimeMinutes: computeReadingTime(blocks),
      seoTitle: body?.seoTitle || null,
      seoDescription: body?.seoDescription || null,
      seoCanonical: body?.seoCanonical || null,
      focusKeyword: body?.focusKeyword || null,
      seoScore,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning({ id: schema.cmsArticles.id })
  const id = inserted[0]?.id

  await db.insert(schema.cmsArticleVersions).values({ articleId: id, title, contentJson, editedBy: user.id, createdAt: nowTs })

  return { ok: true, id, slug }
})

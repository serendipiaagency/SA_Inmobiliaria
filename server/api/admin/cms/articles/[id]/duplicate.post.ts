import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

/** Duplicates an article as a new draft — real copy-on-write, not a shared reference. */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const rows = await db
    .select()
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
    .limit(1)
  const original = rows[0]
  if (!original) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let slug = `${original.slug}-copia`
  const collision = await db
    .select({ id: schema.cmsArticles.id })
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.organizationId, orgId), eq(schema.cmsArticles.slug, slug)))
    .limit(1)
  if (collision[0]) slug = `${slug}-${Math.floor(Math.random() * 10000)}`

  const nowTs = now()
  const inserted = await db
    .insert(schema.cmsArticles)
    .values({
      organizationId: orgId,
      authorId: original.authorId,
      categoryId: original.categoryId,
      title: `${original.title} (copia)`,
      slug,
      excerpt: original.excerpt,
      contentJson: original.contentJson,
      coverImage: original.coverImage,
      language: original.language,
      status: 'draft',
      readingTimeMinutes: original.readingTimeMinutes,
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      seoCanonical: null,
      focusKeyword: original.focusKeyword,
      seoScore: original.seoScore,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning({ id: schema.cmsArticles.id })
  const newId = inserted[0]?.id

  await db.insert(schema.cmsArticleVersions).values({ articleId: newId, title: `${original.title} (copia)`, contentJson: original.contentJson, editedBy: user.id, createdAt: nowTs })

  const tagLinks = await db.select({ tagId: schema.cmsArticleTags.tagId }).from(schema.cmsArticleTags).where(eq(schema.cmsArticleTags.articleId, id))
  for (const t of tagLinks) await db.insert(schema.cmsArticleTags).values({ articleId: newId, tagId: t.tagId })

  return { ok: true, id: newId, slug }
})

import { and, eq, isNull, sql } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId } from '../../../../../utils/db'
import { rateLimit } from '../../../../../utils/rateLimit'
import { requireValidEmail } from '../../../../../utils/validate'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'cms-comment', { limit: 5, windowSeconds: 600 })

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

  const settingsRows = await db.select().from(schema.cmsSettings).where(eq(schema.cmsSettings.organizationId, orgId)).limit(1)
  const commentsEnabled = settingsRows[0] ? !!settingsRows[0].commentsEnabled : true
  if (!commentsEnabled) throw createError({ statusCode: 403, statusMessage: 'Comments are disabled for this site' })
  const requireApproval = settingsRows[0] ? !!settingsRows[0].commentsRequireApproval : true

  const body = await readBody<Record<string, any>>(event)
  const authorName = String(body?.authorName || '').trim().slice(0, 120)
  const content = String(body?.content || '').trim().slice(0, 3000)
  if (!authorName || !content) throw createError({ statusCode: 422, statusMessage: 'authorName and content are required' })
  const authorEmail = body?.authorEmail ? requireValidEmail(String(body.authorEmail)) : null

  let parentId: number | null = null
  if (body?.parentId) {
    const parent = await db
      .select({ id: schema.cmsComments.id })
      .from(schema.cmsComments)
      .where(and(eq(schema.cmsComments.id, Number(body.parentId)), eq(schema.cmsComments.articleId, rows[0].id), eq(schema.cmsComments.status, 'approved')))
      .limit(1)
    if (parent[0]) parentId = parent[0].id
  }

  await db.insert(schema.cmsComments).values({
    organizationId: orgId,
    articleId: rows[0].id,
    parentId,
    authorName,
    authorEmail,
    content,
    status: requireApproval ? 'pending' : 'approved',
    createdAt: now(),
  })
  // commentCount reflects visible (approved) comments only — a pending one doesn't
  // bump the public count until a moderator approves it.
  if (!requireApproval) {
    await db.update(A).set({ commentCount: sql`${A.commentCount} + 1` }).where(eq(A.id, rows[0].id))
  }

  return { ok: true, pendingApproval: requireApproval }
})

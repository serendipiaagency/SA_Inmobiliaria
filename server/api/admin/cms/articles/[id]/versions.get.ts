import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

/** Version history for an article — Fase 7 builds diff/restore UI on top of this. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // Confirm the article belongs to this org before leaking its version history.
  const owned = await db
    .select({ id: schema.cmsArticles.id })
    .from(schema.cmsArticles)
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
    .limit(1)
  if (!owned[0]) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const rows = await db
    .select({
      id: schema.cmsArticleVersions.id,
      title: schema.cmsArticleVersions.title,
      editedBy: schema.cmsArticleVersions.editedBy,
      createdAt: schema.cmsArticleVersions.createdAt,
      editorName: schema.users.name,
    })
    .from(schema.cmsArticleVersions)
    .leftJoin(schema.users, eq(schema.cmsArticleVersions.editedBy, schema.users.id))
    .where(eq(schema.cmsArticleVersions.articleId, id))
    .orderBy(desc(schema.cmsArticleVersions.id))
    .limit(50)

  return { rows }
})

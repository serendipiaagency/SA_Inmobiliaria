import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

/** Restores an article from Papelera back to draft (never straight back to published). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  await db
    .update(schema.cmsArticles)
    .set({ deletedAt: null })
    .where(and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId)))
  return { ok: true }
})

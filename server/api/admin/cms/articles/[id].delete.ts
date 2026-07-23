import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

/**
 * Soft-deletes by default (moves to Papelera, recoverable). Pass ?hard=1 to
 * permanently delete — used by the Papelera page's "eliminar definitivamente".
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const hard = String(getQuery(event).hard || '') === '1'
  const db = useDb(event)
  const where = and(eq(schema.cmsArticles.id, id), eq(schema.cmsArticles.organizationId, orgId))

  if (hard) {
    await db.delete(schema.cmsArticles).where(where)
  } else {
    await db.update(schema.cmsArticles).set({ deletedAt: now(), status: 'draft' }).where(where)
  }
  return { ok: true }
})

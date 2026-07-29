import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'

/**
 * Soft-deletes by default (moves to Papelera, recoverable). Pass ?hard=1 to
 * permanently delete — used by the Papelera page's "eliminar definitivamente".
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
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
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'cms-articles', resourceId: id, detail: hard ? 'hard' : 'soft' })
  return { ok: true }
})

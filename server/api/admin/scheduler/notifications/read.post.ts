import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

/** POST /api/admin/scheduler/notifications/read — Body: {id} for one, or {} to mark every unread as read. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ id?: number }>(event)
  const db = useDb(event)
  const N = schema.publicationNotifications
  const nowTs = now()

  if (body?.id) {
    await db.update(N).set({ readAt: nowTs }).where(and(eq(N.id, body.id), eq(N.organizationId, orgId)))
  } else {
    await db.update(N).set({ readAt: nowTs }).where(and(eq(N.organizationId, orgId), isNull(N.readAt)))
  }
  return { ok: true }
})

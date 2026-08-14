import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const row = (await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id)).limit(1))[0]
  if (!row || row.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id))
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'webhook-endpoint', resourceId: id })
  return { ok: true }
})

import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const endpoint = (await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id)).limit(1))[0]
  if (!endpoint || endpoint.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  return await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.endpointId, id)).orderBy(desc(schema.webhookDeliveries.createdAt)).limit(50)
})

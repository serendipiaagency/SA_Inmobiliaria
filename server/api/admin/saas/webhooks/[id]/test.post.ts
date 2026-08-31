import { and, desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'
import { dispatchWebhook } from '../../../../../utils/webhooks'

/** Sends a genuine test HTTP POST to the endpoint (real request, real response code) — not a simulated "success" toast. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const row = (await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id)).limit(1))[0]
  if (!row || row.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let subscribed: string[]
  try {
    subscribed = JSON.parse(row.eventsJson || '[]')
  } catch {
    subscribed = []
  }
  const testEvent = (subscribed[0] || 'lead.created') as any
  await dispatchWebhook(event, orgId, testEvent, { test: true, message: 'Evento de prueba enviado desde el panel de administración' })

  const [delivery] = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(and(eq(schema.webhookDeliveries.endpointId, id)))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(1)

  return delivery || { status: 'failed', errorMessage: 'No se registró ninguna entrega — revisa que el endpoint esté activo y suscrito a algún evento' }
})

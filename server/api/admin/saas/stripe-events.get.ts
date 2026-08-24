import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Read-only audit trail of Stripe webhook events that touched this org's deposits — see server/api/stripe/webhook.post.ts. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return db
    .select({
      id: schema.stripeWebhookEvents.id,
      eventId: schema.stripeWebhookEvents.eventId,
      type: schema.stripeWebhookEvents.type,
      depositId: schema.stripeWebhookEvents.depositId,
      processedOk: schema.stripeWebhookEvents.processedOk,
      note: schema.stripeWebhookEvents.note,
      receivedAt: schema.stripeWebhookEvents.receivedAt,
    })
    .from(schema.stripeWebhookEvents)
    .where(eq(schema.stripeWebhookEvents.organizationId, orgId))
    .orderBy(desc(schema.stripeWebhookEvents.id))
    .limit(100)
})

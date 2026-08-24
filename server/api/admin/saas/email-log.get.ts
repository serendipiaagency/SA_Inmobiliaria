import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Read-only send/delivery history for this org's transactional & commercial email — see server/utils/email/. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  return db
    .select({
      id: schema.emailLog.id,
      template: schema.emailLog.template,
      kind: schema.emailLog.kind,
      recipient: schema.emailLog.recipient,
      subject: schema.emailLog.subject,
      status: schema.emailLog.status,
      attempts: schema.emailLog.attempts,
      errorMessage: schema.emailLog.errorMessage,
      createdAt: schema.emailLog.createdAt,
      sentAt: schema.emailLog.sentAt,
      deliveredAt: schema.emailLog.deliveredAt,
      bouncedAt: schema.emailLog.bouncedAt,
      complainedAt: schema.emailLog.complainedAt,
    })
    .from(schema.emailLog)
    .where(eq(schema.emailLog.organizationId, orgId))
    .orderBy(desc(schema.emailLog.id))
    .limit(200)
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.organizationId, orgId))
  // Never return the raw secret to the client after creation — show a masked hint only.
  return rows.map((r) => ({ ...r, secret: undefined, secretHint: `${r.secret.slice(0, 4)}…${r.secret.slice(-4)}` }))
})

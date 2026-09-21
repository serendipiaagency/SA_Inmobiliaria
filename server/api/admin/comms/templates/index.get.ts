import { and, asc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'

/** GET /api/admin/comms/templates?channelId= — plantillas registradas (todas las del canal, con su estado). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const channelId = Number(getQuery(event).channelId) || null
  const rows = await db
    .select()
    .from(schema.commsTemplates)
    .where(and(eq(schema.commsTemplates.organizationId, orgId), channelId ? eq(schema.commsTemplates.channelId, channelId) : undefined))
    .orderBy(asc(schema.commsTemplates.channelId), asc(schema.commsTemplates.name))
  return { rows: rows.map((t: any) => ({ id: t.id, channelId: t.channelId, name: t.name, language: t.language, category: t.category, body: t.body, status: t.status, externalId: t.externalId, syncedAt: t.syncedAt })) }
})

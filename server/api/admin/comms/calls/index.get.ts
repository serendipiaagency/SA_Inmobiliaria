import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { schema, useDb } from '../../../../utils/db'
import { crmNamesFor, serializeCall, serializeContact } from '../../../../utils/comms/admin'

/** GET /api/admin/comms/calls?contactId=&limit= — historial de llamadas de la organización (o de un contacto). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = getQuery(event)
  const contactId = q.contactId ? Number(q.contactId) : null
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50))
  const rows = await db
    .select()
    .from(schema.commsCalls)
    .where(and(eq(schema.commsCalls.organizationId, orgId), contactId ? eq(schema.commsCalls.contactId, contactId) : undefined))
    .orderBy(desc(schema.commsCalls.id))
    .limit(limit)
  const contactIds = [...new Set(rows.map((r: any) => r.contactId as number))]
  const contacts = contactIds.length ? await db.select().from(schema.commsContacts).where(inArray(schema.commsContacts.id, contactIds)) : []
  const crm = await crmNamesFor(db, orgId, contacts)
  const contactById = new Map(contacts.map((c: any) => [c.id, serializeContact(c, crm)]))
  return { rows: rows.map((r: any) => ({ ...serializeCall(r), contact: contactById.get(r.contactId) ?? null })) }
})

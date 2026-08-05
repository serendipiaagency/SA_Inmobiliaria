import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

const REDACTED_NAME = 'Eliminado por solicitud RGPD'

/**
 * Anonymizes personal data rather than hard-deleting rows — a lead/visit/
 * contract often has other real records (deals, audit entries, visit
 * history) pointing at it, and silently destroying those breaks legitimate
 * business history. This scrubs name/email/phone/notes to a redacted
 * placeholder instead, which satisfies the erasure request without
 * corrupting referential data. Honestly reports exactly how many rows were
 * touched, in which tables — never a vague "done".
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()
  if (!email) throw createError({ statusCode: 422, statusMessage: 'email is required' })

  const db = useDb(event)
  const nowTs = now()

  const leadsRes = await db
    .update(schema.leads)
    .set({ name: REDACTED_NAME, email: null, phone: null, notes: null, updatedAt: nowTs })
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.email, email)))
  const clientsRes = await db
    .update(schema.clients)
    .set({ name: REDACTED_NAME, email: null, phone: null, notes: null, updatedAt: nowTs })
    .where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.email, email)))
  const visitsRes = await db
    .update(schema.visits)
    .set({ clientName: REDACTED_NAME, clientEmail: null, clientPhone: null, notes: null })
    .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.clientEmail, email)))
  const contractsRes = await db
    .update(schema.contracts)
    .set({ clientName: REDACTED_NAME, clientEmail: null, updatedAt: nowTs })
    .where(and(eq(schema.contracts.organizationId, orgId), eq(schema.contracts.clientEmail, email)))
  const searchesRes = await db.delete(schema.savedSearches).where(and(eq(schema.savedSearches.organizationId, orgId), eq(schema.savedSearches.email, email)))

  const affected = {
    leads: leadsRes.meta?.changes || 0,
    clients: clientsRes.meta?.changes || 0,
    visits: visitsRes.meta?.changes || 0,
    contracts: contractsRes.meta?.changes || 0,
    savedSearches: searchesRes.meta?.changes || 0,
  }
  const rowsAffected = Object.values(affected).reduce((a, b) => a + b, 0)

  await db.insert(schema.gdprRequests).values({ organizationId: orgId, requestType: 'delete', subjectEmail: email, rowsAffected, requestedBy: user.id, createdAt: nowTs })
  await logAdminAction(event, { user, orgId, action: 'delete', resource: 'gdpr-delete', resourceId: 0 })

  return { email, rowsAffected, affected }
})

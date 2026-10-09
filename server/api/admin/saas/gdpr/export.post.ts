import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

/**
 * Real personal-data export scoped to this tenant, matched by email across
 * every table that actually stores a `clientEmail`/`email` column — leads,
 * clients, visits, contracts, saved searches and newsletter subscriptions.
 * Does not touch `users` (login accounts), which is a materially different,
 * more sensitive action than a data-subject export and out of scope here.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()
  if (!email) throw createError({ statusCode: 422, statusMessage: 'email is required' })

  const db = useDb(event)
  const [leads, clients, visits, contracts, savedSearches, newsletterRows] = await Promise.all([
    db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.email, email))),
    db.select().from(schema.clients).where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.email, email))),
    db.select().from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.clientEmail, email))),
    db.select().from(schema.contracts).where(and(eq(schema.contracts.organizationId, orgId), eq(schema.contracts.clientEmail, email))),
    db.select().from(schema.savedSearches).where(and(eq(schema.savedSearches.organizationId, orgId), eq(schema.savedSearches.email, email))),
    db.select().from(schema.newsletterSubscriptions).where(and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.email, email))),
  ])
  // Sin los hashes de los tokens: no son datos de la persona.
  const newsletterSubscriptions = newsletterRows.map(({ unsubscribeTokenHash: _u, confirmTokenHash: _c, ...rest }: any) => rest)

  const rowsAffected = leads.length + clients.length + visits.length + contracts.length + savedSearches.length + newsletterSubscriptions.length
  await db.insert(schema.gdprRequests).values({ organizationId: orgId, requestType: 'export', subjectEmail: email, rowsAffected, requestedBy: user.id, createdAt: now() })
  await logAdminAction(event, { user, orgId, action: 'run', resource: 'gdpr-export', resourceId: 0 })

  return { email, exportedAt: now(), rowsAffected, data: { leads, clients, visits, contracts, savedSearches, newsletterSubscriptions } }
})

import { and, desc, eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { useDb, schema } from '../../utils/db'

/**
 * Client-facing self-service view. There is no FK linking `users` to
 * `leads`/`visits`/`contracts` — those are captured from public forms before
 * any account exists — so we match by the logged-in user's own email,
 * scoped to their organization, rather than adding new columns for it.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!user.organizationId) throw createError({ statusCode: 403, statusMessage: 'Esta cuenta no está asociada a ninguna inmobiliaria' })

  const db = useDb(event)
  const email = user.email

  const [visits, leads, contracts] = await Promise.all([
    db
      .select()
      .from(schema.visits)
      .where(and(eq(schema.visits.organizationId, user.organizationId), eq(schema.visits.clientEmail, email)))
      .orderBy(desc(schema.visits.scheduledAt)),
    db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, user.organizationId), eq(schema.leads.email, email)))
      .orderBy(desc(schema.leads.createdAt)),
    db
      .select()
      .from(schema.contracts)
      .where(and(eq(schema.contracts.organizationId, user.organizationId), eq(schema.contracts.clientEmail, email)))
      .orderBy(desc(schema.contracts.createdAt)),
  ])

  return { visits, leads, contracts }
})

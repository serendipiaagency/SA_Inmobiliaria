import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from './db'

interface UpsertLeadInput {
  name: string
  email?: string | null
  phone?: string | null
  source: string
  propertyId?: number | null
  propertyName?: string | null
  budget?: number | null
  notes?: string | null
  scoreBump?: number
}

/**
 * Creates or refreshes a CRM lead from a real inbound public action (contact form,
 * visit request, visitor verification form). Matches by email when available so
 * repeat contact from the same prospect updates one record instead of duplicating it.
 */
export async function upsertLead(event: H3Event, input: UpsertLeadInput) {
  const db = useDb(event)
  const nowTs = now()
  const bump = input.scoreBump ?? 10

  if (input.email) {
    const existing = await db
      .select({ id: schema.leads.id, score: schema.leads.score })
      .from(schema.leads)
      .where(eq(schema.leads.email, input.email))
      .limit(1)
    if (existing[0]) {
      await db
        .update(schema.leads)
        .set({
          lastContactAt: nowTs,
          updatedAt: nowTs,
          score: Math.min(100, existing[0].score + bump),
          ...(input.propertyId ? { propertyId: input.propertyId, propertyName: input.propertyName || null } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.budget ? { budget: input.budget } : {}),
        })
        .where(eq(schema.leads.id, existing[0].id))
      return
    }
  }

  await db.insert(schema.leads).values({
    name: input.name.slice(0, 200),
    email: input.email || null,
    phone: input.phone || null,
    source: input.source,
    status: 'new',
    score: bump,
    budget: input.budget || null,
    propertyId: input.propertyId || null,
    propertyName: input.propertyName || null,
    notes: input.notes || null,
    lastContactAt: nowTs,
    createdAt: nowTs,
    updatedAt: nowTs,
  })
}

import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from './db'
import { dispatchWebhook } from './webhooks'

interface UpsertLeadInput {
  /** Which tenant this lead belongs to — always the caller's resolved org, never client input. */
  organizationId: number
  name: string
  email?: string | null
  phone?: string | null
  source: string
  propertyId?: number | null
  propertyName?: string | null
  agentId?: number | null
  agentName?: string | null
  budget?: number | null
  notes?: string | null
  scoreBump?: number
}

/**
 * Creates or refreshes a CRM lead from a real inbound public action (contact form,
 * visit request, visitor verification form). Matches by email when available so
 * repeat contact from the same prospect updates one record instead of duplicating it —
 * scoped to organizationId too, so two tenants sharing a prospect's email can never
 * read or overwrite each other's lead (real bug found and fixed while building the
 * public API: this used to match by email alone across every tenant).
 */
export async function upsertLead(event: H3Event, input: UpsertLeadInput) {
  const db = useDb(event)
  const nowTs = now()
  const bump = input.scoreBump ?? 10

  if (input.email) {
    const existing = await db
      .select({ id: schema.leads.id, score: schema.leads.score })
      .from(schema.leads)
      .where(and(eq(schema.leads.email, input.email), eq(schema.leads.organizationId, input.organizationId)))
      .limit(1)
    if (existing[0]) {
      await db
        .update(schema.leads)
        .set({
          lastContactAt: nowTs,
          updatedAt: nowTs,
          score: Math.min(100, existing[0].score + bump),
          ...(input.propertyId ? { propertyId: input.propertyId, propertyName: input.propertyName || null } : {}),
          ...(input.agentId ? { agentId: input.agentId, agentName: input.agentName || null } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.budget ? { budget: input.budget } : {}),
        })
        .where(eq(schema.leads.id, existing[0].id))
      return
    }
  }

  const [row] = await db
    .insert(schema.leads)
    .values({
      organizationId: input.organizationId,
      name: input.name.slice(0, 200),
      email: input.email || null,
      phone: input.phone || null,
      source: input.source,
      status: 'new',
      score: bump,
      budget: input.budget || null,
      propertyId: input.propertyId || null,
      propertyName: input.propertyName || null,
      agentId: input.agentId || null,
      agentName: input.agentName || null,
      notes: input.notes || null,
      lastContactAt: nowTs,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await dispatchWebhook(event, input.organizationId, 'lead.created', { id: row.id, name: row.name, email: row.email, source: row.source, propertyName: row.propertyName })
}

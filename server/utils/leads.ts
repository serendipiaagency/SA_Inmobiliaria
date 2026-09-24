import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now, cfEnv } from './db'
import { dispatchWebhook } from './webhooks'
import { sendInternalNotification } from './email/send'
import { getRequestId } from './requestId'
import { resolveContact, orgDefaultCountryPrefix } from './contacts/service'
import { routeLead, assignLead, buildRoutingContextFromProperty } from './leads/routing'

interface UpsertLeadInput {
  /** Which tenant this lead belongs to — always the caller's resolved org, never client input. */
  organizationId: number
  name: string
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  source: string
  sourceDetail?: string | null
  campaign?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  landingPage?: string | null
  referrer?: string | null
  /** El mensaje de captación tal cual, nunca reescrito — distinto de `notes`. */
  originalMessage?: string | null
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
 *
 * FASE 12 (migración 0069): además resuelve la persona detrás de la entrada vía
 * `resolveContact()` — la misma función de dedup que ya usa el CRM manual, no una
 * nueva. Un email/teléfono que ya coincide EXACTO con un Contact existente enlaza
 * ahí; si no, crea un Contact nuevo. Nunca fusiona: `resolveContact` ya deja los
 * casos ambiguos como contacto nuevo + candidatos, que es la política de FASE 14.
 * Antes de esta fase, `contactId` se quedaba NULL en todo lead creado después del
 * backfill de la migración 0066 — esto lo corrige hacia delante.
 */
export async function upsertLead(event: H3Event, input: UpsertLeadInput) {
  const db = useDb(event)
  const nowTs = now()
  const bump = input.scoreBump ?? 10

  let contactId: number | null = null
  if (input.email || input.phone || input.whatsapp) {
    try {
      const defaultCountryPrefix = await orgDefaultCountryPrefix(event, input.organizationId)
      const resolved = await resolveContact(
        event,
        input.organizationId,
        { name: input.name, email: input.email, phone: input.phone, whatsapp: input.whatsapp },
        { defaultCountryPrefix },
      )
      contactId = resolved.contactId
    } catch {
      // Resolver el Contact nunca debe impedir que el lead se guarde — si algo
      // falla aquí, el lead se crea igual con contactId NULL, recuperable a mano.
    }
  }

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
          ...(contactId && { contactId }),
        })
        .where(eq(schema.leads.id, existing[0].id))
      return { id: existing[0].id, created: false }
    }
  }

  const [row] = await db
    .insert(schema.leads)
    .values({
      organizationId: input.organizationId,
      name: input.name.slice(0, 200),
      email: input.email || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      source: input.source,
      sourceDetail: input.sourceDetail || null,
      campaign: input.campaign || input.utmCampaign || null,
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
      utmContent: input.utmContent || null,
      utmTerm: input.utmTerm || null,
      landingPage: input.landingPage || null,
      referrer: input.referrer || null,
      originalMessage: input.originalMessage || null,
      status: 'new',
      stage: 'new',
      score: bump,
      budget: input.budget || null,
      propertyId: input.propertyId || null,
      propertyName: input.propertyName || null,
      agentId: input.agentId || null,
      agentName: input.agentName || null,
      notes: input.notes || null,
      lastContactAt: nowTs,
      contactId,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await dispatchWebhook(event, input.organizationId, 'lead.created', { id: row.id, name: row.name, email: row.email, source: row.source, propertyName: row.propertyName })

  try {
    await sendInternalNotification(db, cfEnv(event), input.organizationId, 'lead_created', { name: row.name, email: row.email, source: row.source, propertyName: row.propertyName }, getRequestId(event))
  } catch {
    // The lead is already saved — a notification failure must never undo that.
  }

  // FASE 15 (migración 0071): sólo enruta si quien llamó no trajo ya un
  // comercial (p.ej. una reserva de cita con un agente concreto vino con
  // dueño desde el principio — el routing nunca pisa una elección explícita).
  if (!input.agentId) {
    try {
      const ctx = await buildRoutingContextFromProperty(event, input.organizationId, input.propertyId)
      const decision = await routeLead(event, input.organizationId, ctx)
      if (decision.commercialId) await assignLead(event, input.organizationId, row.id, decision)
    } catch {
      // El lead ya está guardado — un fallo del routing nunca debe deshacerlo; queda sin asignar, recuperable a mano.
    }
  }

  return { id: row.id, created: true }
}

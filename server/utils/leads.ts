import { and, eq, isNull, notInArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now, cfEnv } from './db'
import { dispatchWebhook } from './webhooks'
import { sendInternalNotification } from './email/send'
import { platformBaseUrl } from './email/links'
import { getRequestId } from './requestId'
import { resolveContact, orgDefaultCountryPrefix } from './contacts/service'
import { routeLead, assignLead, buildRoutingContextFromProperty, resolvePropertyResponsible } from './leads/routing'
import { recordActivity } from './activity/service'
import { recomputeLeadScore } from './leads/score'
import { parseLeadPropertyKind, type LeadPropertyKind } from './leads/property'
import { normalizeLanguage } from '../../utils/crmCatalog'

export interface UpsertLeadInput {
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
  /**
   * Catálogo de `propertyId` (migración 0089): 'agent' (2ª mano) o
   * 'developer' (obra nueva). Quien llama lo pone cuando lo sabe (la web
   * pública sólo enseña obra nueva; el panel y la API v1 lo dicen); sin él
   * queda NULL y los lectores usan la resolución de siempre.
   */
  propertyKind?: LeadPropertyKind | null
  propertyName?: string | null
  agentId?: number | null
  agentName?: string | null
  budget?: number | null
  notes?: string | null
  // Núcleo inmobiliario (migración 0086): idioma (también para el enrutado),
  // id del lead en el sistema de origen (portal, CRM externo), portal,
  // prioridad, oficina/equipo y quién lo dio de alta a mano.
  /** Se normaliza al catálogo (`normalizeLanguage`): «es-ES» o «English» llegan como «es» / «en»; lo que no es del catálogo no se guarda. */
  language?: string | null
  externalId?: string | null
  portal?: string | null
  priority?: string | null
  officeId?: number | null
  teamId?: number | null
  createdBy?: number | null
}

/**
 * El lead que una entrada nueva debe actualizar en vez de duplicar (FASE 14),
 * dentro de la organización y en este orden:
 *   1. mismo id externo del mismo origen (un portal que reenvía su lead);
 *   2. mismo email (el comportamiento de siempre);
 *   3. la misma persona — el Contact que ya resolvió `resolveContact()` por
 *      email, teléfono o WhatsApp normalizados — con un lead todavía abierto
 *      (ni ganado ni perdido). Un lead cerrado no se reabre en silencio: la
 *      persona vuelve y se crea uno nuevo, con su propia historia.
 */
export async function findReusableLead(
  db: any,
  orgId: number,
  input: { email?: string | null; externalId?: string | null; source?: string | null; contactId?: number | null; sameProperty?: { id: number; kind: LeadPropertyKind | null } | null },
): Promise<{ id: number; matchedOn: 'external_id' | 'email' | 'contact' } | null> {
  const base = [eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)]
  // Una consulta desde la ficha de una propiedad es un interés por ESA
  // propiedad: sólo se reutiliza el lead de la misma persona sobre la misma
  // propiedad. Si pregunta por otra, es otro lead (el Contact sí es el mismo).
  if (input.sameProperty) base.push(eq(schema.leads.propertyId, input.sameProperty.id))
  if (input.externalId && input.source) {
    const [row] = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(...base, eq(schema.leads.externalId, input.externalId), eq(schema.leads.source, input.source)))
      .limit(1)
    if (row) return { id: row.id, matchedOn: 'external_id' }
  }
  if (input.email) {
    const [row] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...base, eq(schema.leads.email, input.email))).limit(1)
    if (row) return { id: row.id, matchedOn: 'email' }
  }
  if (input.contactId) {
    const [row] = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(...base, eq(schema.leads.contactId, input.contactId), notInArray(schema.leads.status, ['won', 'lost'])))
      .orderBy(schema.leads.id)
      .limit(1)
    if (row) return { id: row.id, matchedOn: 'contact' }
  }
  return null
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
export interface UpsertLeadOptions {
  /** 'same_property': reutilizar sólo un lead de la misma propiedad (consultas desde su ficha). */
  reuse?: 'default' | 'same_property'
  /** Si ninguna regla de enrutado asigna el lead, dárselo al comercial responsable de la propiedad. */
  routingFallback?: 'property_responsible'
}

export async function upsertLead(event: H3Event, rawInput: UpsertLeadInput, opts: UpsertLeadOptions = {}) {
  const db = useDb(event)
  const nowTs = now()
  // FASE 15: el idioma, siempre del catálogo — así la regla «Idioma» del
  // enrutado compara códigos y no «es-ES» contra «es».
  const input: UpsertLeadInput = { ...rawInput, language: normalizeLanguage(rawInput.language) }

  let contactId: number | null = null
  if (input.email || input.phone || input.whatsapp) {
    try {
      const defaultCountryPrefix = await orgDefaultCountryPrefix(event, input.organizationId)
      const resolved = await resolveContact(
        event,
        input.organizationId,
        { name: input.name, email: input.email, phone: input.phone, whatsapp: input.whatsapp, language: input.language },
        { defaultCountryPrefix },
      )
      contactId = resolved.contactId
    } catch {
      // Resolver el Contact nunca debe impedir que el lead se guarde — si algo
      // falla aquí, el lead se crea igual con contactId NULL, recuperable a mano.
    }
  }

  const sameProperty = opts.reuse === 'same_property' && input.propertyId ? { id: input.propertyId, kind: parseLeadPropertyKind(input.propertyKind) } : null
  const reusable = await findReusableLead(db, input.organizationId, { email: input.email, externalId: input.externalId, source: input.source, contactId, sameProperty })
  if (reusable) {
    const [current] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, reusable.id), eq(schema.leads.organizationId, input.organizationId))).limit(1)
    await db
      .update(schema.leads)
      .set({
        lastContactAt: nowTs,
        updatedAt: nowTs,
        // La propiedad nueva viaja con su catálogo (o NULL si quien llama no lo sabe): nunca un id nuevo con el catálogo del anterior.
        ...(input.propertyId ? { propertyId: input.propertyId, propertyKind: parseLeadPropertyKind(input.propertyKind), propertyName: input.propertyName || null } : {}),
        ...(input.agentId ? { agentId: input.agentId, agentName: input.agentName || null } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.budget ? { budget: input.budget } : {}),
        ...(contactId && { contactId }),
        // Lo que faltaba en el lead existente se completa; lo que ya tenía no se pisa.
        ...(input.email && !current?.email ? { email: input.email } : {}),
        ...(input.whatsapp && !current?.whatsapp ? { whatsapp: input.whatsapp } : {}),
        ...(input.language && !current?.language ? { language: input.language } : {}),
        ...(input.externalId && !current?.externalId ? { externalId: input.externalId } : {}),
      })
      .where(and(eq(schema.leads.id, reusable.id), eq(schema.leads.organizationId, input.organizationId)))
    await refreshScore(db, input.organizationId, reusable.id, 'signal')
    return { id: reusable.id, created: false, matchedOn: reusable.matchedOn }
  }

  return insertLead(event, input, contactId, { routingFallback: opts.routingFallback })
}

/**
 * Inserta SIEMPRE un lead nuevo, con su actividad, aviso, webhook, enrutado y
 * score. Lo usan `upsertLead()` (cuando no hay nada que reutilizar) y el alta
 * manual del panel cuando alguien decide «crear igualmente» pese a un
 * duplicado (server/utils/leads/admin.ts).
 */
export async function insertLead(event: H3Event, rawInput: UpsertLeadInput, contactId: number | null, opts: { skipRouting?: boolean; routingFallback?: UpsertLeadOptions['routingFallback'] } = {}) {
  const db = useDb(event)
  const nowTs = now()
  const input: UpsertLeadInput = { ...rawInput, language: normalizeLanguage(rawInput.language) }
  const propertyKind = input.propertyId ? parseLeadPropertyKind(input.propertyKind) : null

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
      portal: input.portal || null,
      priority: input.priority || null,
      language: input.language || null,
      externalId: input.externalId || null,
      officeId: input.officeId ?? null,
      teamId: input.teamId ?? null,
      createdBy: input.createdBy ?? null,
      convertedAt: contactId ? nowTs : null,
      status: 'new',
      stage: 'new',
      // FASE 32: ya no hay "bump" — la puntuación la calcula
      // leads/score.ts a partir de señales reales, justo abajo.
      score: 0,
      budget: input.budget || null,
      propertyId: input.propertyId || null,
      propertyKind,
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
  await recordActivity(db, input.organizationId, {
    eventType: 'LEAD_CREATED',
    entityType: 'lead',
    entityId: row.id,
    leadId: row.id,
    contactId,
    // Con la propiedad, el «Lead recibido» sale también en la actividad de la propiedad.
    propertyId: row.propertyId ?? null,
    propertyKind: row.propertyId ? propertyKind : null,
    actorType: contactId ? 'contact' : 'system',
    metadata: { source: row.source, ...(row.sourceDetail ? { sourceDetail: row.sourceDetail } : {}) },
  })

  try {
    await sendInternalNotification(db, cfEnv(event), input.organizationId, 'lead_created', { name: row.name, email: row.email, source: row.source, propertyName: row.propertyName, adminUrl: `${platformBaseUrl(event)}/admin/leads/${row.id}` }, getRequestId(event))
  } catch {
    // The lead is already saved — a notification failure must never undo that.
  }

  // FASE 15 (migración 0071): sólo enruta si quien llamó no trajo ya un
  // comercial (p.ej. una reserva de cita con un agente concreto vino con
  // dueño desde el principio — el routing nunca pisa una elección explícita).
  if (!input.agentId && !opts.skipRouting) {
    try {
      // Con el catálogo del lead se lee sólo ese; sin él (NULL), como siempre.
      const ctx = await buildRoutingContextFromProperty(event, input.organizationId, input.propertyId, propertyKind)
      // El idioma del lead también enruta (regla «Idioma»), y la oficina que
      // ya trae acota el reparto a esa oficina.
      ctx.language = input.language || null
      ctx.officeId = input.officeId ?? null
      let decision = await routeLead(event, input.organizationId, ctx)
      // La consulta llegó desde la ficha de la propiedad, que enseña a su
      // comercial como «Atendido por»: si ninguna regla de la agencia la
      // asigna, va a ese comercial y no se queda sin dueño.
      if (!decision.commercialId && opts.routingFallback === 'property_responsible' && input.propertyId) {
        const responsible = await resolvePropertyResponsible(event, input.organizationId, input.propertyId, propertyKind)
        // Sólo si sigue siendo un comercial activo de esta agencia (agent_id no tiene FK).
        const active = responsible
          ? (await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, responsible), eq(schema.teamMembers.organizationId, input.organizationId), eq(schema.teamMembers.employmentStatus, 'active'))).limit(1))[0]
          : null
        if (active) decision = { commercialId: responsible, ruleId: null, explanation: 'Sin regla aplicable: comercial responsable de la propiedad consultada (formulario de su ficha)' }
      }
      if (decision.commercialId) await assignLead(event, input.organizationId, row.id, decision)
    } catch {
      // El lead ya está guardado — un fallo del routing nunca debe deshacerlo; queda sin asignar, recuperable a mano.
    }
  }

  await refreshScore(db, input.organizationId, row.id, 'created')
  return { id: row.id, created: true, matchedOn: null }
}

/**
 * FASE 32 — el Lead Score explicable sustituye al "bump" fijo que se sumaba
 * en cada entrada (10, 25, 30…): se recalcula con las señales reales del
 * lead. Igual que el routing, un fallo aquí nunca deshace la captación.
 */
async function refreshScore(db: any, orgId: number, leadId: number, reason: 'created' | 'signal') {
  try {
    await recomputeLeadScore(db, orgId, leadId, reason)
  } catch {
    // El lead ya está guardado; su puntuación se recalculará con la próxima señal o desde la ficha.
  }
}

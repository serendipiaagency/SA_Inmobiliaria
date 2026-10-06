import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { now, schema, useDb } from '../db'
import type { SessionUser } from '../auth'
import { logAdminAction } from '../audit'
import { findDuplicateContacts, orgDefaultCountryPrefix, resolveContact } from '../contacts/service'
import { assertOwnedRef } from '../contacts/crm'
import { assertLiveProperty } from '../properties/trash'
import { insertLead, type UpsertLeadInput } from '../leads'
import { assignLead } from './routing'
import { leadPropertySummary, type LeadPropertyKind } from './property'
import { recomputeLeadScore } from './score'
import { LEAD_PRIORITIES, LEAD_SOURCES } from '../../../utils/leadCatalog'
import { LANGUAGE_OPTIONS } from '../../../utils/crmCatalog'

/**
 * El lead desde el panel (núcleo inmobiliario, FASES 12-16): alta manual con
 * deduplicación antes de crear (unificar o crear igualmente), edición de
 * todos sus campos de captación y la ficha completa con sus historiales.
 *
 * Sin rutas nuevas: es el recurso `leads` del motor genérico
 * (server/api/admin/[resource]/**), igual que `contacts`. Lo que NO se edita
 * aquí, a propósito:
 *   - la etapa y el resultado (perdido/reactivado) → PATCH
 *     /api/admin/saas/leads/:id, que es lo único que escribe el historial;
 *   - el comercial → POST /api/admin/saas/leads/:id/reassign, que deja la
 *     asignación en su historial;
 *   - el mensaje original, que es la foto de la entrada y nunca se reescribe.
 */

function fail(statusCode: number, statusMessage: string, data?: unknown): never {
  throw createError({ statusCode, statusMessage, data })
}

/** Lo que el panel puede escribir de un lead, ya validado y normalizado (sólo las claves presentes). */
export interface LeadAdminInput {
  name?: string
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  source?: string
  sourceDetail?: string | null
  campaign?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  portal?: string | null
  landingPage?: string | null
  referrer?: string | null
  originalMessage?: string | null
  priority?: string | null
  budget?: number | null
  language?: string | null
  externalId?: string | null
  notes?: string | null
  officeId?: number | null
  teamId?: number | null
  agentId?: number | null
  propertyId?: number | null
  propertyKind?: LeadPropertyKind | null
  contactId?: number | null
}

const TEXT_LIMITS: Record<string, number> = {
  phone: 40,
  whatsapp: 40,
  sourceDetail: 200,
  campaign: 200,
  utmSource: 200,
  utmMedium: 200,
  utmCampaign: 200,
  utmContent: 200,
  utmTerm: 200,
  portal: 100,
  landingPage: 500,
  referrer: 500,
  originalMessage: 5000,
  externalId: 200,
  notes: 5000,
}

/** Valida el cuerpo de un alta o una edición; un valor que no está en su catálogo es un 422, nunca se ignora en silencio. */
export function leadInputFromBody(body: Record<string, any>): LeadAdminInput {
  const out: LeadAdminInput = {}
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name) fail(422, 'El nombre es obligatorio')
    if (name.length > 200) fail(422, 'El nombre admite como máximo 200 caracteres')
    out.name = name
  }
  if ('email' in body) {
    const v = body.email == null ? '' : String(body.email).trim().toLowerCase()
    if (v.length > 254) fail(422, 'email: máximo 254 caracteres')
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(422, 'El email no tiene un formato válido')
    out.email = v || null
  }
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    if (!(k in body)) continue
    const v = body[k] == null ? '' : String(body[k]).trim()
    if (v.length > max) fail(422, `${k}: máximo ${max} caracteres`)
    ;(out as any)[k] = v || null
  }
  if ('source' in body) {
    const v = String(body.source ?? '')
    if (!(LEAD_SOURCES as readonly string[]).includes(v)) fail(422, 'Origen no válido')
    out.source = v
  }
  if ('priority' in body) {
    const v = body.priority ? String(body.priority) : null
    if (v && !(LEAD_PRIORITIES as readonly string[]).includes(v)) fail(422, 'Prioridad no válida')
    out.priority = v
  }
  if ('language' in body) {
    const v = body.language ? String(body.language) : null
    if (v && !(LANGUAGE_OPTIONS as readonly string[]).includes(v)) fail(422, 'Idioma no válido')
    out.language = v
  }
  if ('budget' in body) {
    if (body.budget === null || body.budget === '' || body.budget === undefined) out.budget = null
    else {
      const n = Number(body.budget)
      if (!Number.isFinite(n) || n < 0) fail(422, 'El presupuesto debe ser un número positivo')
      out.budget = n
    }
  }
  for (const k of ['officeId', 'teamId', 'agentId', 'propertyId', 'contactId'] as const) {
    if (!(k in body)) continue
    const raw = body[k]
    if (raw === null || raw === undefined || raw === '') {
      out[k] = null
      continue
    }
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) fail(422, `${k}: identificador inválido`)
    out[k] = n
  }
  if ('propertyKind' in body) {
    if (body.propertyKind === null || body.propertyKind === undefined || body.propertyKind === '') out.propertyKind = null
    else if (body.propertyKind !== 'agent' && body.propertyKind !== 'developer') fail(422, 'propertyKind debe ser "agent" (2ª mano) o "developer" (web)')
    else out.propertyKind = body.propertyKind
  }
  return out
}

/**
 * El contacto que se vincula al lead (selector «Contacto» del formulario):
 * de esta agencia (404 si no) y vivo — uno archivado al unificar
 * duplicados, o en la papelera, ya no es la persona (422). Si es el que el
 * lead ya tenía, no se vuelve a juzgar.
 */
async function assertLinkableContact(db: any, orgId: number, contactId: number | null | undefined, currentContactId?: number | null) {
  if (contactId == null || contactId === currentContactId) return
  const [row] = await db
    .select({ id: schema.contacts.id, deletedAt: schema.contacts.deletedAt, status: schema.contacts.status })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId)))
    .limit(1)
  if (!row) fail(404, 'Contacto no encontrado')
  if (row.deletedAt || row.status === 'archived') fail(422, 'Ese contacto está archivado (se unificó con otro o está en la papelera): elige el que sigue activo')
}

/**
 * Valida que oficina, equipo, comercial, contacto y propiedad son de esta
 * agencia, y devuelve el nombre y el catálogo de la propiedad (migración
 * 0089: el lead guarda los dos). La propiedad se busca SÓLO en el catálogo
 * indicado — nunca se adivina — y una de la papelera no se puede poner como
 * propiedad de interés (422 que dice qué hacer).
 */
async function assertLeadRefs(
  db: any,
  orgId: number,
  input: LeadAdminInput,
  current: { contactId?: number | null } = {},
): Promise<{ propertyName?: string | null; propertyKind?: LeadPropertyKind | null }> {
  await assertOwnedRef(db, schema.offices, input.officeId, orgId, 'Oficina')
  await assertOwnedRef(db, schema.teams, input.teamId, orgId, 'Equipo')
  await assertOwnedRef(db, schema.teamMembers, input.agentId, orgId, 'Comercial')
  await assertLinkableContact(db, orgId, input.contactId, current.contactId)
  if (input.teamId && input.officeId) {
    const [team] = await db.select({ officeId: schema.teams.officeId }).from(schema.teams).where(and(eq(schema.teams.id, input.teamId), eq(schema.teams.organizationId, orgId))).limit(1)
    if (team?.officeId && team.officeId !== input.officeId) fail(422, 'Ese equipo es de otra oficina')
  }
  if (input.propertyId === undefined) return {}
  if (input.propertyId === null) return { propertyName: null, propertyKind: null }
  const kind = input.propertyKind
  if (!kind) fail(422, 'Indica de qué catálogo es la propiedad (propertyKind: "agent" 2ª mano o "developer" obra nueva)')
  await assertLiveProperty(db, orgId, kind, input.propertyId, { action: 'ponerla como propiedad de interés de un lead' })
  const summary = await leadPropertySummary(db, orgId, { propertyId: input.propertyId, propertyKind: kind })
  if (!summary) fail(404, 'Propiedad no encontrada')
  return { propertyName: summary.name, propertyKind: kind }
}

export interface LeadDuplicate {
  leadId: number
  name: string
  email: string | null
  phone: string | null
  stage: string
  status: string
  agentName: string | null
  createdAt: string
  /** Qué coincidió: email, teléfono, WhatsApp, id externo o contacto. */
  matchedOn: string
}

/**
 * Leads de la agencia que podrían ser la misma oportunidad (FASE 14): mismo
 * email, mismo id externo del mismo origen, o la misma persona — un Contact
 * que coincide EXACTO por email, teléfono o WhatsApp normalizados — con un
 * lead todavía abierto. Nunca mira fuera de la organización.
 */
export async function findLeadDuplicates(
  event: H3Event,
  orgId: number,
  input: { name?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null; externalId?: string | null; source?: string | null; contactId?: number | null },
  opts: { excludeLeadId?: number } = {},
): Promise<LeadDuplicate[]> {
  const db = useDb(event)
  const base = [eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)]
  if (opts.excludeLeadId) base.push(ne(schema.leads.id, opts.excludeLeadId))
  const found = new Map<number, string>()

  if (input.externalId && input.source) {
    const rows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...base, eq(schema.leads.externalId, input.externalId), eq(schema.leads.source, input.source))).limit(5)
    for (const r of rows) found.set(r.id, 'id externo')
  }
  if (input.email) {
    const rows = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...base, sql`lower(${schema.leads.email}) = ${input.email.toLowerCase()}`)).limit(5)
    for (const r of rows) if (!found.has(r.id)) found.set(r.id, 'email')
  }

  // La persona: el contacto elegido, o los contactos que coinciden exactos.
  const personMatches = new Map<number, string>()
  if (input.contactId) personMatches.set(input.contactId, 'contacto')
  if (input.email || input.phone || input.whatsapp) {
    const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
    const candidates = await findDuplicateContacts(event, orgId, { name: input.name || '', email: input.email, phone: input.phone, whatsapp: input.whatsapp }, { defaultCountryPrefix })
    for (const c of candidates) if (c.level === 'exact' && !personMatches.has(c.contactId)) personMatches.set(c.contactId, c.matchedOn)
  }
  if (personMatches.size) {
    const rows = await db
      .select({ id: schema.leads.id, contactId: schema.leads.contactId })
      .from(schema.leads)
      .where(and(...base, inArray(schema.leads.contactId, [...personMatches.keys()]), notInArray(schema.leads.status, ['won', 'lost'])))
      .limit(10)
    for (const r of rows) if (!found.has(r.id)) found.set(r.id, (r.contactId != null && personMatches.get(r.contactId)) || 'contacto')
  }

  if (!found.size) return []
  const rows = await db
    .select({
      leadId: schema.leads.id,
      name: schema.leads.name,
      email: schema.leads.email,
      phone: schema.leads.phone,
      stage: schema.leads.stage,
      status: schema.leads.status,
      agentName: schema.leads.agentName,
      createdAt: schema.leads.createdAt,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.id, [...found.keys()])))
  return rows.map((r: any) => ({ ...r, matchedOn: found.get(r.leadId)! }))
}

/** Completa un lead existente con lo que le falta (unificar): nunca pisa lo que ya tenía. */
async function mergeIntoLead(event: H3Event, orgId: number, user: SessionUser, targetId: number, input: LeadAdminInput, property: { propertyName?: string | null; propertyKind?: LeadPropertyKind | null }) {
  const db = useDb(event)
  const [target] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, targetId), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    .limit(1)
  if (!target) fail(404, 'Lead no encontrado')
  const patch: Record<string, any> = {}
  const fillable = ['email', 'phone', 'whatsapp', 'sourceDetail', 'campaign', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'portal', 'landingPage', 'referrer', 'originalMessage', 'priority', 'budget', 'language', 'externalId', 'officeId', 'teamId', 'contactId'] as const
  for (const k of fillable) if ((input as any)[k] != null && target[k] == null) patch[k] = (input as any)[k]
  if (input.propertyId && !target.propertyId) Object.assign(patch, { propertyId: input.propertyId, propertyKind: property.propertyKind ?? null, propertyName: property.propertyName ?? null })
  // Las notas se suman, no se sustituyen: es lo que se habló en esta nueva entrada.
  if (input.notes) patch.notes = target.notes ? `${target.notes}\n\n${input.notes}` : input.notes
  if (patch.contactId && !target.convertedAt) patch.convertedAt = now()
  const ts = now()
  await db
    .update(schema.leads)
    .set({ ...patch, lastContactAt: ts, updatedAt: ts })
    .where(and(eq(schema.leads.id, targetId), eq(schema.leads.organizationId, orgId)))
  await safeRecompute(db, orgId, targetId)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: targetId, detail: 'unificado con una nueva entrada manual' })
  return { ok: true, id: targetId, merged: true }
}

async function safeRecompute(db: any, orgId: number, leadId: number) {
  try {
    await recomputeLeadScore(db, orgId, leadId, 'signal')
  } catch {
    // El lead ya está guardado; el score se recalcula con la próxima señal o desde la ficha.
  }
}

/**
 * Alta manual (POST /api/admin/leads). Antes de crear comprueba duplicados
 * (FASE 14): con coincidencias responde 409 con la lista, y quien decide
 * elige entre `mergeIntoLeadId` (unificar: completa ese lead) o `force: true`
 * (crear igualmente, queda en Auditoría).
 */
export async function createLeadFromAdmin(event: H3Event, orgId: number, user: SessionUser, body: Record<string, any>) {
  const db = useDb(event)
  const input = leadInputFromBody(body)
  if (!input.name) fail(422, 'El nombre es obligatorio')
  if (!input.source) fail(422, 'Indica el origen del lead')
  if (!input.email && !input.phone && !input.whatsapp && !input.contactId) fail(422, 'Indica al menos un email, un teléfono o un contacto existente')
  const { propertyName, propertyKind } = await assertLeadRefs(db, orgId, input)

  const mergeInto = Number(body.mergeIntoLeadId) || 0
  if (mergeInto) return mergeIntoLead(event, orgId, user, mergeInto, input, { propertyName, propertyKind })

  const duplicates = await findLeadDuplicates(event, orgId, { ...input, source: input.source })
  if (duplicates.length && body.force !== true) fail(409, 'Puede que este lead ya exista', { duplicates })

  // La persona: el contacto elegido o el que resuelve la deduplicación de
  // contactos de siempre (enlaza si coincide exacto, si no crea uno nuevo).
  let contactId = input.contactId ?? null
  if (!contactId) {
    const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
    const resolved = await resolveContact(event, orgId, { name: input.name, email: input.email, phone: input.phone, whatsapp: input.whatsapp, language: input.language }, { createdBy: user.id, defaultCountryPrefix })
    contactId = resolved.contactId
  }

  const leadInput: UpsertLeadInput = {
    organizationId: orgId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    whatsapp: input.whatsapp,
    source: input.source,
    sourceDetail: input.sourceDetail,
    campaign: input.campaign,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent,
    utmTerm: input.utmTerm,
    portal: input.portal,
    landingPage: input.landingPage,
    referrer: input.referrer,
    originalMessage: input.originalMessage,
    priority: input.priority,
    budget: input.budget,
    language: input.language,
    externalId: input.externalId,
    notes: input.notes,
    officeId: input.officeId,
    teamId: input.teamId,
    propertyId: input.propertyId,
    propertyKind,
    propertyName,
    createdBy: user.id,
  }
  // Con comercial elegido a mano no se enruta: se asigna y queda en su
  // historial como asignación manual. Sin él, decide el Lead Routing.
  const created = await insertLead(event, leadInput, contactId, { skipRouting: !!input.agentId })
  if (input.agentId) {
    await assignLead(event, orgId, created.id, { commercialId: input.agentId, ruleId: null, explanation: 'Asignado a mano en el alta' }, { assignedBy: user.id })
  }
  await logAdminAction(event, {
    user,
    orgId,
    action: 'create',
    resource: 'lead',
    resourceId: created.id,
    detail: duplicates.length ? `creado pese a ${duplicates.length} posible(s) duplicado(s)` : undefined,
  })
  return { ok: true, id: created.id }
}

/**
 * Edición (PUT /api/admin/leads/:id) de los datos de captación. Si el email,
 * teléfono, WhatsApp o id externo nuevos ya son de otro lead abierto, 409 con
 * los candidatos salvo `force: true`.
 */
export async function updateLeadFromAdmin(event: H3Event, orgId: number, user: SessionUser, id: number, body: Record<string, any>) {
  const db = useDb(event)
  const input = leadInputFromBody(body)
  // Ni etapa, ni resultado, ni comercial, ni el mensaje original: ver la cabecera del fichero.
  delete input.agentId
  delete input.originalMessage
  const [existing] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    .limit(1)
  if (!existing) fail(404, 'Lead no encontrado')
  // El catálogo sólo viaja con un id: un `propertyKind` suelto no cambia nada.
  if (!('propertyId' in input)) delete input.propertyKind
  // La misma propiedad que ya tenía (id y catálogo) no se revalida: que
  // después se mandara a la papelera no impide guardar el resto del lead.
  else if (input.propertyId != null && input.propertyId === existing.propertyId && input.propertyKind === existing.propertyKind) {
    delete input.propertyId
    delete input.propertyKind
  }
  const { propertyName, propertyKind } = await assertLeadRefs(db, orgId, input, { contactId: existing.contactId })

  const identityChanged = (['email', 'phone', 'whatsapp', 'externalId', 'source'] as const).some((k) => k in input && (input as any)[k] !== existing[k])
  if (identityChanged && body.force !== true) {
    const merged = {
      name: input.name ?? existing.name,
      email: 'email' in input ? input.email : existing.email,
      phone: 'phone' in input ? input.phone : existing.phone,
      whatsapp: 'whatsapp' in input ? input.whatsapp : existing.whatsapp,
      externalId: 'externalId' in input ? input.externalId : existing.externalId,
      source: input.source ?? existing.source,
    }
    // Sólo cuentan las coincidencias por los datos nuevos: la persona de este
    // mismo lead (su contacto) no es un duplicado de sí misma.
    const duplicates = (await findLeadDuplicates(event, orgId, merged, { excludeLeadId: id })).filter((d) => d.matchedOn !== 'contacto')
    if (duplicates.length) fail(409, 'Ese email, teléfono o id externo ya es de otro lead de tu agencia', { duplicates })
  }

  const patch: Record<string, any> = { ...input }
  if ('propertyId' in input) Object.assign(patch, { propertyKind: propertyKind ?? null, propertyName: propertyName ?? null })
  // Enlazar el lead a un contacto es su conversión: se fecha la primera vez.
  if (input.contactId && !existing.convertedAt) patch.convertedAt = now()
  if (!Object.keys(patch).length) return { ok: true, id, lead: existing }
  patch.updatedAt = now()
  await db.update(schema.leads).set(patch).where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId)))
  await safeRecompute(db, orgId, id)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead', resourceId: id, detail: `campos: ${Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ')}` })
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId))).limit(1)
  return { ok: true, id, lead }
}

/** Nombre de usuarios del panel de esta agencia (o del super admin, que también mueve leads). */
async function userNames(db: any, orgId: number, ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const list = [...new Set(ids.filter((v): v is number => typeof v === 'number'))]
  if (!list.length) return new Map()
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(and(inArray(schema.users.id, list), or(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'super_admin'))))
  return new Map(rows.map((r: any) => [r.id, r.name || r.email]))
}

/**
 * Ficha del lead (GET /api/admin/leads/:id): todos sus campos, el historial
 * de etapas con usuario y motivo, el de asignaciones con su explicación, el
 * contacto, oficina/equipo, sus alertas SLA abiertas, visitas y
 * conversaciones. Tareas, ofertas, actividad y notas las pide la página a sus
 * propios endpoints, que ya filtran por `leadId`.
 */
export async function getLeadDetail(event: H3Event, orgId: number, id: number) {
  const db = useDb(event)
  const [row] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    .limit(1)
  if (!row) fail(404, 'Lead no encontrado')

  const stageRows = await db
    .select()
    .from(schema.leadStageHistory)
    .where(and(eq(schema.leadStageHistory.organizationId, orgId), eq(schema.leadStageHistory.leadId, id)))
    .orderBy(desc(schema.leadStageHistory.createdAt), desc(schema.leadStageHistory.id))
  const assignmentRows = await db
    .select()
    .from(schema.leadAssignmentHistory)
    .where(and(eq(schema.leadAssignmentHistory.organizationId, orgId), eq(schema.leadAssignmentHistory.leadId, id)))
    .orderBy(desc(schema.leadAssignmentHistory.createdAt), desc(schema.leadAssignmentHistory.id))

  const names = await userNames(db, orgId, [...stageRows.map((r: any) => r.userId), ...assignmentRows.map((r: any) => r.assignedBy), row.createdBy])
  const commercialIds = [...new Set(assignmentRows.flatMap((r: any) => [r.fromCommercialId, r.toCommercialId]).filter((v: any): v is number => typeof v === 'number'))]
  const commercials: Map<number, string> = commercialIds.length
    ? new Map(
        (await db.select({ id: schema.teamMembers.id, name: schema.teamMembers.name }).from(schema.teamMembers).where(and(eq(schema.teamMembers.organizationId, orgId), inArray(schema.teamMembers.id, commercialIds)))).map(
          (r: any) => [r.id, r.name],
        ),
      )
    : new Map()
  const ruleIds = [...new Set(assignmentRows.map((r: any) => r.ruleId).filter((v: any): v is number => typeof v === 'number'))]
  const rules: Map<number, string> = ruleIds.length
    ? new Map(
        (await db.select({ id: schema.leadRoutingRules.id, name: schema.leadRoutingRules.name }).from(schema.leadRoutingRules).where(and(eq(schema.leadRoutingRules.organizationId, orgId), inArray(schema.leadRoutingRules.id, ruleIds)))).map(
          (r: any) => [r.id, r.name],
        ),
      )
    : new Map()

  const [contact] = row.contactId
    ? await db
        .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone, whatsapp: schema.contacts.whatsapp })
        .from(schema.contacts)
        .where(and(eq(schema.contacts.id, row.contactId), eq(schema.contacts.organizationId, orgId)))
        .limit(1)
    : []
  // La propiedad de interés con su catálogo y el enlace a su ficha (sin
  // catálogo en el lead —filas anteriores a la 0089— se resuelve como siempre
  // y se dice que es una deducción).
  const property = await leadPropertySummary(db, orgId, row)
  const [office] = row.officeId ? await db.select({ name: schema.offices.name }).from(schema.offices).where(and(eq(schema.offices.id, row.officeId), eq(schema.offices.organizationId, orgId))).limit(1) : []
  const [team] = row.teamId ? await db.select({ name: schema.teams.name }).from(schema.teams).where(and(eq(schema.teams.id, row.teamId), eq(schema.teams.organizationId, orgId))).limit(1) : []

  const slaAlerts = await db
    .select({ id: schema.leadSlaAlerts.id, type: schema.leadSlaAlerts.type, openedAt: schema.leadSlaAlerts.openedAt })
    .from(schema.leadSlaAlerts)
    .where(and(eq(schema.leadSlaAlerts.organizationId, orgId), eq(schema.leadSlaAlerts.leadId, id), eq(schema.leadSlaAlerts.status, 'open')))

  const visits = await db
    .select({
      id: schema.visits.id,
      scheduledAt: schema.visits.scheduledAt,
      status: schema.visits.status,
      type: schema.visits.type,
      propertyName: schema.visits.propertyName,
      agentName: schema.visits.agentName,
      outcome: schema.visits.outcome,
      interestLevel: schema.visits.interestLevel,
    })
    .from(schema.visits)
    // Cierre D3a: la ficha del lead no enseña las citas de la papelera.
    .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.leadId, id), isNull(schema.visits.deletedAt)))
    .orderBy(desc(schema.visits.scheduledAt))
    .limit(50)

  const conversations = await db
    .select({
      id: schema.commsConversations.id,
      lastMessageAt: schema.commsConversations.lastMessageAt,
      lastMessagePreview: schema.commsConversations.lastMessagePreview,
      status: schema.commsConversations.status,
    })
    .from(schema.commsConversations)
    .innerJoin(schema.commsContacts, eq(schema.commsContacts.id, schema.commsConversations.contactId))
    .where(and(eq(schema.commsConversations.organizationId, orgId), eq(schema.commsContacts.organizationId, orgId), eq(schema.commsContacts.leadId, id)))
    .orderBy(desc(schema.commsConversations.lastMessageAt))
    .limit(20)

  return {
    row,
    contact: contact || null,
    property,
    officeName: office?.name ?? null,
    teamName: team?.name ?? null,
    createdByName: row.createdBy ? names.get(row.createdBy) ?? null : null,
    // Cierre D3a: tenía autor pero ese usuario ya no existe («usuario eliminado»), igual que en el resto de fichas.
    createdByDeleted: !!row.createdBy && !names.get(row.createdBy),
    stageHistory: stageRows.map((r: any) => ({ ...r, userName: r.userId ? names.get(r.userId) ?? null : null })),
    assignmentHistory: assignmentRows.map((r: any) => ({
      ...r,
      fromCommercialName: r.fromCommercialId ? commercials.get(r.fromCommercialId) ?? null : null,
      toCommercialName: r.toCommercialId ? commercials.get(r.toCommercialId) ?? null : null,
      ruleName: r.ruleId ? rules.get(r.ruleId) ?? null : null,
      assignedByName: r.assignedBy ? names.get(r.assignedBy) ?? null : null,
    })),
    slaAlerts,
    visits,
    conversations,
  }
}

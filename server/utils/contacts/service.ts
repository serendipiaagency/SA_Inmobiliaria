import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { normalizePhone } from '../comms/phone'

/**
 * Contact — la persona del dominio (FASE 10, migración 0066).
 *
 * Todo lo que crea o edita un Contact pasa por aquí para que la
 * normalización sea una sola y la deduplicación mire siempre los mismos
 * valores. El normalizador de teléfonos NO es nuevo: es el mismo
 * server/utils/comms/phone.ts que ya usa el Centro de Comunicaciones, para
 * que un número guardado desde el CRM y uno llegado por WhatsApp se crucen.
 */

export interface ContactInput {
  name: string
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  kind?: string
  language?: string | null
  assignedCommercialId?: number | null
  notes?: string | null
  externalSource?: string | null
  externalId?: string | null
  // Cabecera CRM 360 (migración 0086).
  country?: string | null
  source?: string | null
  officeId?: number | null
  status?: string | null
  nextActionType?: string | null
  nextActionAt?: string | null
}

/** El email en minúsculas y sin espacios. `null` cuando no hay nada que normalizar. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const trimmed = String(input || '').trim().toLowerCase()
  return trimmed || null
}

/**
 * Los valores con los que se deduplica. `defaultCountryPrefix` viene de los
 * ajustes de comunicaciones de la agencia: sin él, un número local sin
 * prefijo internacional se queda sin normalizar a propósito — adivinar el
 * país es la forma de cruzar a dos personas distintas.
 */
export function normalizedIdentity(input: ContactInput, defaultCountryPrefix?: string | null) {
  return {
    normalizedEmail: normalizeEmail(input.email),
    normalizedPhone: normalizePhone(input.phone, defaultCountryPrefix),
    normalizedWhatsapp: normalizePhone(input.whatsapp ?? input.phone, defaultCountryPrefix),
  }
}

/**
 * El prefijo internacional configurado por la agencia
 * (comms_settings.default_country_prefix). Sin él, un número escrito en
 * local ("600112233") no se puede normalizar y se queda fuera del cruce de
 * duplicados: quien lo escribió vería crearse un contacto repetido.
 */
export async function orgDefaultCountryPrefix(event: H3Event, orgId: number): Promise<string | null> {
  const db = useDb(event)
  const row = (
    await db
      .select({ prefix: schema.commsSettings.defaultCountryPrefix })
      .from(schema.commsSettings)
      .where(eq(schema.commsSettings.organizationId, orgId))
      .limit(1)
  )[0]
  return row?.prefix || null
}

export type DuplicateLevel = 'exact' | 'possible'

export interface DuplicateCandidate {
  contactId: number
  name: string
  email: string | null
  phone: string | null
  /** `exact` = coincide una identidad normalizada (email/teléfono/id externo). `possible` = sólo se parece. */
  level: DuplicateLevel
  /** Qué señal coincidió, para poder enseñárselo a quien decide. */
  matchedOn: string
}

/**
 * Busca posibles duplicados DENTRO del tenant.
 *
 * Nunca fusiona nada: devuelve candidatos para que una persona decida
 * (unificar / vincular / crear igualmente). Y nunca mira fuera de la
 * organización — que otra agencia tenga a esa persona no es información que
 * esta agencia pueda llegar a deducir.
 */
export async function findDuplicateContacts(
  event: H3Event,
  orgId: number,
  input: ContactInput,
  opts: { defaultCountryPrefix?: string | null; excludeContactId?: number } = {},
): Promise<DuplicateCandidate[]> {
  const db = useDb(event)
  const ident = normalizedIdentity(input, opts.defaultCountryPrefix)

  const signals = []
  if (ident.normalizedEmail) signals.push({ col: schema.contacts.normalizedEmail, value: ident.normalizedEmail, label: 'email' })
  if (ident.normalizedPhone) signals.push({ col: schema.contacts.normalizedPhone, value: ident.normalizedPhone, label: 'teléfono' })
  if (ident.normalizedWhatsapp && ident.normalizedWhatsapp !== ident.normalizedPhone) {
    signals.push({ col: schema.contacts.normalizedWhatsapp, value: ident.normalizedWhatsapp, label: 'WhatsApp' })
  }

  const found = new Map<number, DuplicateCandidate>()

  for (const signal of signals) {
    const rows = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.organizationId, orgId), eq(signal.col, signal.value), isNull(schema.contacts.deletedAt)))
      .limit(10)
    for (const row of rows) {
      if (opts.excludeContactId && row.id === opts.excludeContactId) continue
      found.set(row.id, { contactId: row.id, name: row.name, email: row.email, phone: row.phone, level: 'exact', matchedOn: signal.label })
    }
  }

  // Un id externo sólo identifica dentro de su propio origen.
  if (input.externalSource && input.externalId) {
    const rows = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.organizationId, orgId),
          eq(schema.contacts.externalSource, input.externalSource),
          eq(schema.contacts.externalId, input.externalId),
          isNull(schema.contacts.deletedAt),
        ),
      )
      .limit(5)
    for (const row of rows) {
      if (opts.excludeContactId && row.id === opts.excludeContactId) continue
      found.set(row.id, { contactId: row.id, name: row.name, email: row.email, phone: row.phone, level: 'exact', matchedOn: 'id externo' })
    }
  }

  // Coincidencia débil: mismo nombre exacto sin ninguna identidad que lo
  // confirme. Se devuelve como `possible` — jamás como duplicado seguro:
  // "García" y "García" son dos personas distintas muy a menudo.
  const nameTrimmed = String(input.name || '').trim()
  if (nameTrimmed && !found.size) {
    const rows = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.organizationId, orgId), eq(schema.contacts.name, nameTrimmed), isNull(schema.contacts.deletedAt)))
      .limit(5)
    for (const row of rows) {
      if (opts.excludeContactId && row.id === opts.excludeContactId) continue
      found.set(row.id, { contactId: row.id, name: row.name, email: row.email, phone: row.phone, level: 'possible', matchedOn: 'nombre' })
    }
  }

  return [...found.values()]
}

/**
 * Busca contactos del tenant por nombre, email o teléfono — la búsqueda de la
 * lista de Contactos, compartida con la Domain Tool find_contacts (FASE 31).
 */
export async function searchContacts(db: any, orgId: number, search: string, limit = 100, opts: { role?: string | null } = {}) {
  const conditions = [eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)]
  // Filtro por rol (FASE 8): sólo los contactos que tienen ese rol en contact_roles.
  if (opts.role) {
    conditions.push(
      sql`exists (select 1 from contact_roles cr where cr.contact_id = ${schema.contacts.id} and cr.organization_id = ${orgId} and cr.role = ${opts.role})`,
    )
  }
  const term = search.trim()
  if (term) {
    const pattern = `%${term.toLowerCase()}%`
    conditions.push(
      or(
        // lower() de SQLite sólo baja ASCII: «Único» sigue con la Ú mayúscula y
        // nunca coincidiría con el patrón en minúsculas. LIKE ya ignora
        // mayúsculas en ASCII, así que el término tal cual cubre los acentos
        // escritos igual que en la ficha.
        like(schema.contacts.name, `%${term}%`),
        like(sql`lower(${schema.contacts.name})`, pattern),
        like(sql`lower(coalesce(${schema.contacts.email}, ''))`, pattern),
        like(sql`coalesce(${schema.contacts.phone}, '')`, `%${term}%`),
      )!,
    )
  }
  return db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      kind: schema.contacts.kind,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      whatsapp: schema.contacts.whatsapp,
      language: schema.contacts.language,
      assignedCommercialId: schema.contacts.assignedCommercialId,
      status: schema.contacts.status,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .where(and(...conditions))
    .orderBy(desc(schema.contacts.id))
    .limit(limit) as Promise<
    { id: number; name: string; kind: string; email: string | null; phone: string | null; whatsapp: string | null; language: string | null; assignedCommercialId: number | null; status: string; createdAt: string }[]
  >
}

/**
 * Crea un Contact. No decide por su cuenta qué hacer ante un duplicado: quien
 * llama consulta antes findDuplicateContacts() y decide. `force` sólo existe
 * para dejar constancia de que la decisión de crear igualmente fue explícita.
 */
export async function createContact(
  event: H3Event,
  orgId: number,
  input: ContactInput,
  opts: { createdBy?: number | null; defaultCountryPrefix?: string | null } = {},
) {
  const db = useDb(event)
  const ident = normalizedIdentity(input, opts.defaultCountryPrefix)
  const nowTs = now()

  const [row] = await db
    .insert(schema.contacts)
    .values({
      organizationId: orgId,
      kind: input.kind === 'company' ? 'company' : 'person',
      name: input.name.trim(),
      email: input.email || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      ...ident,
      externalSource: input.externalSource || null,
      externalId: input.externalId || null,
      language: input.language || null,
      assignedCommercialId: input.assignedCommercialId ?? null,
      notes: input.notes || null,
      country: input.country || null,
      source: input.source || null,
      officeId: input.officeId ?? null,
      nextActionType: input.nextActionType || null,
      nextActionAt: input.nextActionAt || null,
      status: 'active',
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()
  return row
}

export async function updateContact(
  event: H3Event,
  orgId: number,
  contactId: number,
  input: Partial<ContactInput>,
  opts: { defaultCountryPrefix?: string | null } = {},
) {
  const db = useDb(event)
  const existing = (
    await db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!existing) return null

  const merged: ContactInput = {
    name: input.name ?? existing.name,
    email: input.email !== undefined ? input.email : existing.email,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    whatsapp: input.whatsapp !== undefined ? input.whatsapp : existing.whatsapp,
  }
  const ident = normalizedIdentity(merged, opts.defaultCountryPrefix)

  const patch: Record<string, unknown> = { updatedAt: now(), ...ident }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.email !== undefined) patch.email = input.email || null
  if (input.phone !== undefined) patch.phone = input.phone || null
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp || null
  if (input.language !== undefined) patch.language = input.language || null
  if (input.assignedCommercialId !== undefined) patch.assignedCommercialId = input.assignedCommercialId
  if (input.notes !== undefined) patch.notes = input.notes || null
  if (input.kind !== undefined) patch.kind = input.kind === 'company' ? 'company' : 'person'
  if (input.country !== undefined) patch.country = input.country || null
  if (input.source !== undefined) patch.source = input.source || null
  if (input.officeId !== undefined) patch.officeId = input.officeId
  if (input.status !== undefined && input.status) patch.status = input.status
  if (input.nextActionType !== undefined) patch.nextActionType = input.nextActionType || null
  if (input.nextActionAt !== undefined) patch.nextActionAt = input.nextActionAt || null

  await db.update(schema.contacts).set(patch).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId)))
  // Acotada por organización igual que la escritura: nunca se devuelve una
  // fila localizada sólo por su id global.
  return (
    await db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId)))
      .limit(1)
  )[0]
}

/**
 * Resuelve la persona de una entrada (formulario público, importación, IA)
 * sin fusionar nada por su cuenta:
 *
 *   - coincidencia EXACTA única  → se reutiliza ese Contact;
 *   - varias coincidencias exactas, o sólo coincidencias débiles → se crea
 *     uno nuevo y se devuelven los candidatos para que una persona lo
 *     revise. Preferimos un duplicado revisable a fusionar a dos personas
 *     distintas, que es lo que no tiene arreglo.
 */
export async function resolveContact(
  event: H3Event,
  orgId: number,
  input: ContactInput,
  opts: { createdBy?: number | null; defaultCountryPrefix?: string | null } = {},
): Promise<{ contactId: number; created: boolean; candidates: DuplicateCandidate[] }> {
  const candidates = await findDuplicateContacts(event, orgId, input, { defaultCountryPrefix: opts.defaultCountryPrefix })
  const exact = candidates.filter((c) => c.level === 'exact')

  if (exact.length === 1) {
    return { contactId: exact[0].contactId, created: false, candidates }
  }

  const created = await createContact(event, orgId, input, opts)
  return { contactId: created.id, created: true, candidates }
}

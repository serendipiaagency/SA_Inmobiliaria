import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { now, schema, useDb } from '../db'
import type { SessionUser } from '../auth'
import { logAdminAction } from '../audit'
import { createContact, findDuplicateContacts, orgDefaultCountryPrefix, updateContact, type ContactInput } from './service'
import {
  CONTACT_ROLES,
  CONTACT_SOURCES,
  CONTACT_STATUSES,
  NEXT_ACTION_TYPES,
  NOTE_ENTITY_TYPES,
  OWNERSHIP_ROLES,
  PROPERTY_CONTACT_ROLES,
  type NoteEntityType,
} from '../../../utils/crmCatalog'

/**
 * CRM 360 del contacto (núcleo inmobiliario, FASES 8-9; migración 0086):
 * edición del contacto con su normalización y deduplicación, roles
 * múltiples, contactos de una propiedad (propietarios con su %), y la
 * validación de a qué se cuelga una nota.
 *
 * Todo pasa por el motor CRUD genérico (`contacts`, `property-contacts`,
 * `notes` en adminResources.ts) — sin rutas nuevas — y cada lectura y
 * escritura va acotada por la organización.
 */

export type PropertyKind = 'agent' | 'developer'

const DATE_TIME = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/

function fail(statusCode: number, statusMessage: string, data?: unknown): never {
  throw createError({ statusCode, statusMessage, data })
}

/** Valida y normaliza los campos de cabecera que trae el cuerpo (sólo los presentes). */
export function contactInputFromBody(body: Record<string, any>): Partial<ContactInput> {
  const out: Partial<ContactInput> = {}
  const text = (k: keyof ContactInput, max = 300) => {
    if (!(k in body)) return
    const v = body[k] === null || body[k] === undefined ? '' : String(body[k]).trim()
    if (v.length > max) fail(422, `${String(k)}: máximo ${max} caracteres`)
    ;(out as any)[k] = v || null
  }
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name) fail(422, 'El nombre es obligatorio')
    if (name.length > 200) fail(422, 'El nombre admite como máximo 200 caracteres')
    out.name = name
  }
  text('email', 254)
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) fail(422, 'El email no tiene un formato válido')
  text('phone', 40)
  text('whatsapp', 40)
  text('language', 10)
  text('country', 80)
  text('notes', 4000)
  if ('kind' in body) out.kind = body.kind === 'company' ? 'company' : 'person'
  if ('source' in body) {
    const v = body.source ? String(body.source) : null
    if (v && !(CONTACT_SOURCES as readonly string[]).includes(v)) fail(422, 'Origen no válido')
    out.source = v
  }
  if ('status' in body && body.status) {
    if (!(CONTACT_STATUSES as readonly string[]).includes(String(body.status))) fail(422, 'Estado no válido')
    out.status = String(body.status)
  }
  if ('nextActionType' in body) {
    const v = body.nextActionType ? String(body.nextActionType) : null
    if (v && !(NEXT_ACTION_TYPES as readonly string[]).includes(v)) fail(422, 'Tipo de próxima acción no válido')
    out.nextActionType = v
  }
  if ('nextActionAt' in body) {
    const v = body.nextActionAt ? String(body.nextActionAt).trim() : null
    if (v && !DATE_TIME.test(v)) fail(422, 'Fecha de la próxima acción inválida (AAAA-MM-DD o AAAA-MM-DD HH:MM)')
    out.nextActionAt = v ? v.replace('T', ' ') : null
  }
  for (const k of ['assignedCommercialId', 'officeId'] as const) {
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
  return out
}

/** Roles válidos y sin repetir (los desconocidos son un 422, nunca se ignoran en silencio). */
export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) fail(422, 'roles debe ser una lista')
  const out = new Set<string>()
  for (const r of input as unknown[]) {
    const v = String(r)
    if (!(CONTACT_ROLES as readonly string[]).includes(v)) fail(422, `Rol no válido: ${v}`)
    out.add(v)
  }
  return [...out]
}

export async function listContactRoles(db: any, orgId: number, contactId: number): Promise<string[]> {
  const rows = await db
    .select({ role: schema.contactRoles.role })
    .from(schema.contactRoles)
    .where(and(eq(schema.contactRoles.organizationId, orgId), eq(schema.contactRoles.contactId, contactId)))
  return rows.map((r: any) => r.role).sort((a: string, b: string) => CONTACT_ROLES.indexOf(a as any) - CONTACT_ROLES.indexOf(b as any))
}

/** Deja exactamente esos roles (añade los nuevos, quita los que ya no están). */
export async function syncContactRoles(db: any, orgId: number, contactId: number, roles: string[], userId: number | null): Promise<string[]> {
  const current = await listContactRoles(db, orgId, contactId)
  const toAdd = roles.filter((r) => !current.includes(r))
  const toRemove = current.filter((r) => !roles.includes(r))
  if (toRemove.length) {
    await db
      .delete(schema.contactRoles)
      .where(and(eq(schema.contactRoles.organizationId, orgId), eq(schema.contactRoles.contactId, contactId), inArray(schema.contactRoles.role, toRemove)))
  }
  for (const role of toAdd) {
    await db.insert(schema.contactRoles).values({ organizationId: orgId, contactId, role, createdBy: userId, createdAt: now() })
  }
  return listContactRoles(db, orgId, contactId)
}

/**
 * Añade un rol si no lo tiene (p. ej. «Propietario» al vincularlo como
 * propietario de una propiedad). Nunca quita ninguno.
 */
export async function ensureContactRole(db: any, orgId: number, contactId: number, role: string, userId: number | null): Promise<void> {
  const current = await listContactRoles(db, orgId, contactId)
  if (!current.includes(role)) await db.insert(schema.contactRoles).values({ organizationId: orgId, contactId, role, createdBy: userId, createdAt: now() })
}

async function assertOwnedRef(db: any, table: any, id: number | null | undefined, orgId: number, label: string) {
  if (id == null) return
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
  if (!row) fail(404, `${label} no encontrado`)
}

/**
 * Alta de un contacto desde el panel (POST /api/admin/contacts): misma
 * deduplicación que Contactos → Nuevo (409 con candidatos salvo `force`),
 * más los roles.
 */
export async function createContactFromAdmin(event: H3Event, orgId: number, user: SessionUser, body: Record<string, any>) {
  const db = useDb(event)
  const input = contactInputFromBody(body) as ContactInput
  if (!input.name) fail(422, 'El nombre es obligatorio')
  if (!input.email && !input.phone && !input.whatsapp) fail(422, 'Indica al menos un email o un teléfono')
  await assertOwnedRef(db, schema.teamMembers, input.assignedCommercialId, orgId, 'Comercial')
  await assertOwnedRef(db, schema.offices, input.officeId, orgId, 'Oficina')
  const roles = 'roles' in body ? normalizeRoles(body.roles) : []
  const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
  const candidates = await findDuplicateContacts(event, orgId, input, { defaultCountryPrefix })
  if (candidates.length && body.force !== true) fail(409, 'Puede que este contacto ya exista', { duplicates: candidates })
  const contact = await createContact(event, orgId, input, { createdBy: user.id, defaultCountryPrefix })
  if (roles.length) await syncContactRoles(db, orgId, contact.id, roles, user.id)
  await logAdminAction(event, {
    user,
    orgId,
    action: 'create',
    resource: 'contact',
    resourceId: contact.id,
    detail: candidates.length ? `creado pese a ${candidates.length} posible(s) duplicado(s)` : undefined,
  })
  return { ok: true, id: contact.id }
}

/**
 * Edición de un contacto (PUT /api/admin/contacts/:id). Antes no había forma
 * de editar un contacto: `updateContact()` existía sin ninguna ruta. Si el
 * email o el teléfono nuevos ya son de OTRA persona de la agencia, responde
 * 409 con los candidatos (como el alta) salvo `force: true`.
 */
export async function updateContactFromAdmin(event: H3Event, orgId: number, user: SessionUser, id: number, body: Record<string, any>) {
  const db = useDb(event)
  const input = contactInputFromBody(body)
  await assertOwnedRef(db, schema.teamMembers, input.assignedCommercialId, orgId, 'Comercial')
  await assertOwnedRef(db, schema.offices, input.officeId, orgId, 'Oficina')
  const roles = 'roles' in body ? normalizeRoles(body.roles) : null
  const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
  const [existing] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.organizationId, orgId)))
    .limit(1)
  if (!existing) fail(404, 'Contacto no encontrado')
  const identityChanged = (['email', 'phone', 'whatsapp'] as const).some((k) => k in input && (input as any)[k] !== existing[k])
  if (identityChanged && body.force !== true) {
    const merged: ContactInput = { name: input.name ?? existing.name, email: input.email ?? existing.email, phone: input.phone ?? existing.phone, whatsapp: input.whatsapp ?? existing.whatsapp }
    const candidates = (await findDuplicateContacts(event, orgId, merged, { defaultCountryPrefix, excludeContactId: id })).filter((c) => c.level === 'exact')
    if (candidates.length) fail(409, 'Ese email o teléfono ya es de otro contacto de tu agencia', { duplicates: candidates })
  }
  const updated = await updateContact(event, orgId, id, input, { defaultCountryPrefix })
  if (!updated) fail(404, 'Contacto no encontrado')
  const finalRoles = roles ? await syncContactRoles(db, orgId, id, roles, user.id) : await listContactRoles(db, orgId, id)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'contact', resourceId: id })
  return { ok: true, id, contact: updated, roles: finalRoles }
}

// ---------------------------------------------------------------------------
// Contactos de una propiedad (PropertyContact)
// ---------------------------------------------------------------------------

function propertyTable(kind: PropertyKind) {
  return kind === 'agent' ? schema.agentProperties : schema.developerProperties
}

export function assertPropertyKind(kind: unknown): PropertyKind {
  if (kind !== 'agent' && kind !== 'developer') fail(422, 'propertyKind debe ser "agent" (2ª mano) o "developer" (web)')
  return kind
}

/** La propiedad existe y es de esta agencia (404 si no, igual que cualquier referencia ajena). */
export async function assertPropertyOwned(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<void> {
  const t = propertyTable(kind) as any
  const [row] = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, propertyId), eq(t.organizationId, orgId)))
    .limit(1)
  if (!row) fail(404, 'Propiedad no encontrada')
}

/**
 * Valida un alta o edición de property-contacts: propiedad y contacto de la
 * agencia, papel válido, porcentaje entre 0 y 100, y que la suma de los
 * propietarios vivos de la propiedad no pase del 100 %.
 */
export async function validatePropertyContact(db: any, orgId: number, data: Record<string, any>, existing: Record<string, any> | null): Promise<void> {
  const merged = { ...(existing || {}), ...data }
  const kind = assertPropertyKind(merged.propertyKind)
  const propertyId = Number(merged.propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) fail(422, 'Falta la propiedad')
  await assertPropertyOwned(db, orgId, kind, propertyId)
  const contactId = Number(merged.contactId)
  if (!Number.isInteger(contactId) || contactId <= 0) fail(422, 'Falta el contacto')
  await assertOwnedRef(db, schema.contacts, contactId, orgId, 'Contacto')
  if (!(PROPERTY_CONTACT_ROLES as readonly string[]).includes(String(merged.role))) fail(422, 'Papel no válido')
  if (merged.ownershipPct != null) {
    const pct = Number(merged.ownershipPct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail(422, 'El porcentaje de propiedad debe estar entre 0 y 100')
    if (!OWNERSHIP_ROLES.includes(merged.role)) fail(422, 'Sólo un propietario o copropietario tiene porcentaje de propiedad')
    const conds = [
      eq(schema.propertyContacts.organizationId, orgId),
      eq(schema.propertyContacts.propertyKind, kind),
      eq(schema.propertyContacts.propertyId, propertyId),
      isNull(schema.propertyContacts.deletedAt),
      inArray(schema.propertyContacts.role, [...OWNERSHIP_ROLES]),
    ]
    if (existing?.id) conds.push(ne(schema.propertyContacts.id, existing.id))
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.propertyContacts.ownershipPct}), 0)` })
      .from(schema.propertyContacts)
      .where(and(...conds))
    if (Number(total) + pct > 100.0001) fail(422, `La suma de porcentajes de propiedad pasaría del 100 % (ya hay un ${Number(total)} % asignado)`)
  }
  // El mismo contacto no puede estar dos veces con el mismo papel en la misma propiedad.
  const dupConds = [
    eq(schema.propertyContacts.organizationId, orgId),
    eq(schema.propertyContacts.propertyKind, kind),
    eq(schema.propertyContacts.propertyId, propertyId),
    eq(schema.propertyContacts.contactId, contactId),
    eq(schema.propertyContacts.role, String(merged.role)),
    isNull(schema.propertyContacts.deletedAt),
  ]
  if (existing?.id) dupConds.push(ne(schema.propertyContacts.id, existing.id))
  const [dup] = await db.select({ id: schema.propertyContacts.id }).from(schema.propertyContacts).where(and(...dupConds)).limit(1)
  if (dup) fail(409, 'Ese contacto ya está vinculado a esta propiedad con ese papel')
}

/** Los contactos (vivos) de una propiedad, con su nombre y datos de contacto. */
export async function listPropertyContacts(db: any, orgId: number, kind: PropertyKind, propertyId: number) {
  return db
    .select({
      id: schema.propertyContacts.id,
      contactId: schema.propertyContacts.contactId,
      role: schema.propertyContacts.role,
      ownershipPct: schema.propertyContacts.ownershipPct,
      isPrimary: schema.propertyContacts.isPrimary,
      notes: schema.propertyContacts.notes,
      name: schema.contacts.name,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
    })
    .from(schema.propertyContacts)
    .innerJoin(schema.contacts, and(eq(schema.contacts.id, schema.propertyContacts.contactId), eq(schema.contacts.organizationId, orgId)))
    .where(
      and(
        eq(schema.propertyContacts.organizationId, orgId),
        eq(schema.propertyContacts.propertyKind, kind),
        eq(schema.propertyContacts.propertyId, propertyId),
        isNull(schema.propertyContacts.deletedAt),
      ),
    )
    .orderBy(desc(schema.propertyContacts.isPrimary), schema.propertyContacts.id)
}

/** Las propiedades (de los dos catálogos) en las que figura un contacto, con su papel. */
export async function listContactProperties(db: any, orgId: number, contactId: number) {
  const links = await db
    .select()
    .from(schema.propertyContacts)
    .where(and(eq(schema.propertyContacts.organizationId, orgId), eq(schema.propertyContacts.contactId, contactId), isNull(schema.propertyContacts.deletedAt)))
  const out: any[] = []
  for (const kind of ['agent', 'developer'] as const) {
    const ids = links.filter((l: any) => l.propertyKind === kind).map((l: any) => l.propertyId)
    if (!ids.length) continue
    const t = propertyTable(kind) as any
    const rows = await db
      .select({ id: t.id, reference: t.reference, propertyType: t.propertyType, price: t.price, city: t.city, status: t.status, title: kind === 'developer' ? t.name : t.slug })
      .from(t)
      .where(and(eq(t.organizationId, orgId), inArray(t.id, ids)))
    const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]))
    for (const l of links.filter((x: any) => x.propertyKind === kind)) {
      const p = byId.get(l.propertyId)
      if (!p) continue
      out.push({ linkId: l.id, role: l.role, ownershipPct: l.ownershipPct, isPrimary: l.isPrimary, propertyKind: kind, property: p })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

/**
 * Una nota se cuelga de algo que existe y es de esta agencia. Rellena además
 * la columna desnormalizada que corresponde (contactId, leadId…) para poder
 * listar las notas de una persona aunque estén en uno de sus leads.
 */
export async function validateNotePayload(db: any, orgId: number, data: Record<string, any>, existing: Record<string, any> | null): Promise<void> {
  const merged = { ...(existing || {}), ...data }
  const type = String(merged.entityType || '') as NoteEntityType
  if (!(NOTE_ENTITY_TYPES as readonly string[]).includes(type)) fail(422, 'Tipo de entidad no válido para una nota')
  const entityId = Number(merged.entityId)
  if (!Number.isInteger(entityId) || entityId <= 0) fail(422, 'Falta a qué se refiere la nota')
  if (typeof merged.body !== 'string' || !merged.body.trim()) fail(422, 'La nota está vacía')
  if (merged.body.length > 10000) fail(422, 'La nota admite como máximo 10.000 caracteres')
  data.contactId = null
  data.leadId = null
  data.propertyId = null
  data.appointmentId = null
  data.dealOperationId = null
  if (type === 'contact') {
    await assertOwnedRef(db, schema.contacts, entityId, orgId, 'Contacto')
    data.contactId = entityId
  } else if (type === 'lead') {
    await assertOwnedRef(db, schema.leads, entityId, orgId, 'Lead')
    const [lead] = await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(eq(schema.leads.id, entityId)).limit(1)
    data.leadId = entityId
    data.contactId = lead?.contactId ?? null
  } else if (type === 'property') {
    const kind = assertPropertyKind(merged.propertyKind)
    await assertPropertyOwned(db, orgId, kind, entityId)
    data.propertyKind = kind
    data.propertyId = entityId
  } else if (type === 'appointment') {
    await assertOwnedRef(db, schema.visits, entityId, orgId, 'Cita')
    data.appointmentId = entityId
  } else if (type === 'deal') {
    await assertOwnedRef(db, schema.dealOperations, entityId, orgId, 'Operación')
    data.dealOperationId = entityId
  }
}

import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { now, schema, useDb } from '../db'
import type { SessionUser } from '../auth'
import { logAdminAction } from '../audit'
import { createContact, findDuplicateContacts, orgDefaultCountryPrefix, updateContact, type ContactInput } from './service'
import { normalizePhone } from '../comms/phone'
import { recordActivity } from '../activity/service'
import { assertLiveProperty } from '../properties/trash'
import { selectInChunks } from '../sqlChunks'
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
  // Id en otro sistema (portal, CRM anterior) y de qué sistema es: sólo
  // identifica dentro de su origen (índice único organización+origen+id).
  text('externalSource', 100)
  text('externalId', 200)
  text('language', 10)
  text('country', 80)
  text('notes', 4000)
  // Foto (migración 0090): una clave de la biblioteca de medios o una URL https, nunca otra cosa.
  text('photo', 1000)
  if (out.photo && !(/^https:\/\/\S+$/i.test(out.photo) || /^[\w./-]+$/.test(out.photo)) ) fail(422, 'Foto: debe ser una imagen de la biblioteca o un enlace https')
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

export async function assertOwnedRef(db: any, table: any, id: number | null | undefined, orgId: number, label: string) {
  if (id == null) return
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
  if (!row) fail(404, `${label} no encontrado`)
}

/**
 * Id externo (cierre del núcleo, FASE 14): va siempre con su origen — «12345»
 * sólo identifica dentro de «Idealista» — y no puede ser de otro contacto de
 * la agencia, ni siquiera de uno archivado: el índice único
 * (organización, origen, id) no admite «crear igualmente», así que es un 409
 * que lo dice en vez de un error de base de datos.
 */
async function assertExternalRef(db: any, orgId: number, source: string | null | undefined, externalId: string | null | undefined, excludeContactId?: number) {
  if (!source && !externalId) return
  if (!source || !externalId) fail(422, externalId ? 'Indica de qué sistema es el id externo (Idealista, CRM anterior…)' : 'Falta el id externo de ese sistema')
  const conds = [eq(schema.contacts.organizationId, orgId), eq(schema.contacts.externalSource, source), eq(schema.contacts.externalId, externalId)]
  if (excludeContactId) conds.push(ne(schema.contacts.id, excludeContactId))
  const [owner] = await db.select({ id: schema.contacts.id, name: schema.contacts.name, deletedAt: schema.contacts.deletedAt }).from(schema.contacts).where(and(...conds)).limit(1)
  if (owner) {
    fail(409, owner.deletedAt ? `Ese id externo es de un contacto archivado («${owner.name}»)` : `Ese id externo ya es de «${owner.name}»: unifica con ese contacto`, {
      duplicates: owner.deletedAt ? [] : [{ contactId: owner.id, name: owner.name, email: null, phone: null, level: 'exact', matchedOn: 'id externo' }],
    })
  }
}

/**
 * «Unificar» al dar de alta (cierre del núcleo, FASE 14): en vez de crear un
 * contacto que ya existe, completa el existente con los datos NUEVOS que le
 * falten y devuelve ese. Nunca pisa un dato que ya tenga (un email distinto
 * no sustituye al suyo: se ignora y se dice), nunca le pone un email,
 * teléfono, WhatsApp o id externo que ya sea de OTRA persona de la agencia
 * (eso crearía un duplicado cruzado), y suma los roles marcados sin quitar
 * ninguno. Las notas se añaden a las suyas. Queda en Activity
 * (`CONTACT_UNIFIED`, con qué se completó) y en Auditoría.
 *
 * El contacto tiene que ser de esta agencia y estar activo (404 si no).
 */
export async function unifyIntoContact(event: H3Event, orgId: number, user: SessionUser, targetId: number, input: Partial<ContactInput>, roles: string[] = []) {
  const db = useDb(event)
  if (!Number.isInteger(targetId) || targetId <= 0) fail(422, 'Contacto a unificar no válido')
  const [target] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, targetId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
    .limit(1)
  if (!target) fail(404, 'Contacto no encontrado')
  const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)

  const patch: Partial<ContactInput> = {}
  const filled: string[] = []
  const skipped: string[] = []
  const empty = (v: unknown) => v === null || v === undefined || v === ''

  // Identidad: sólo lo que le falta y no es de nadie más.
  const identity = { email: 'email', phone: 'teléfono', whatsapp: 'WhatsApp' } as const
  const wanted: Partial<ContactInput> = {}
  // «El mismo dato escrito de otra forma» (+34 600… / 600…) no es un dato distinto.
  const sameValue = (k: keyof typeof identity) => {
    const a = String(target[k]).trim().toLowerCase()
    const b = String(input[k]).trim().toLowerCase()
    if (a === b) return true
    if (k === 'email') return false
    const na = normalizePhone(String(target[k]), defaultCountryPrefix)
    return !!na && na === normalizePhone(String(input[k]), defaultCountryPrefix)
  }
  for (const k of Object.keys(identity) as (keyof typeof identity)[]) {
    if (empty(input[k])) continue
    if (!empty(target[k])) {
      if (!sameValue(k)) skipped.push(k)
      continue
    }
    wanted[k] = input[k]
  }
  if (Object.keys(wanted).length) {
    const others = await findDuplicateContacts(event, orgId, { name: '', email: wanted.email, phone: wanted.phone, whatsapp: wanted.whatsapp ?? null }, { defaultCountryPrefix, excludeContactId: targetId })
    const taken = new Set(others.filter((c) => c.level === 'exact').map((c) => c.matchedOn))
    for (const k of Object.keys(wanted) as (keyof typeof identity)[]) {
      if (taken.has(identity[k])) skipped.push(k)
      else {
        ;(patch as any)[k] = wanted[k]
        filled.push(k)
      }
    }
  }
  // Id externo: la pareja entera, si no tenía ninguna y está libre.
  if (!empty(input.externalId) && !empty(input.externalSource)) {
    if (empty(target.externalId) && empty(target.externalSource)) {
      const [owner] = await db
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(and(eq(schema.contacts.organizationId, orgId), eq(schema.contacts.externalSource, input.externalSource!), eq(schema.contacts.externalId, input.externalId!), ne(schema.contacts.id, targetId)))
        .limit(1)
      if (owner) skipped.push('externalId')
      else {
        patch.externalSource = input.externalSource
        patch.externalId = input.externalId
        filled.push('externalId')
      }
    } else if (target.externalId !== input.externalId || target.externalSource !== input.externalSource) skipped.push('externalId')
  }
  // Cabecera: lo que esté vacío en el existente.
  for (const k of ['language', 'country', 'source', 'officeId', 'assignedCommercialId', 'nextActionType', 'nextActionAt'] as const) {
    if (empty(input[k])) continue
    if (empty(target[k])) {
      ;(patch as any)[k] = input[k]
      filled.push(k)
    } else if (String(target[k]) !== String(input[k])) skipped.push(k)
  }
  // Las notas se suman: es lo que se apuntó en esta nueva alta.
  if (!empty(input.notes)) {
    patch.notes = target.notes ? `${target.notes}\n\n${input.notes}` : input.notes
    filled.push('notes')
  }

  const updated = Object.keys(patch).length ? await updateContact(event, orgId, targetId, patch, { defaultCountryPrefix }) : target
  if (!updated) fail(404, 'Contacto no encontrado')
  const before = await listContactRoles(db, orgId, targetId)
  for (const role of roles) await ensureContactRole(db, orgId, targetId, role, user.id)
  const addedRoles = roles.filter((r) => !before.includes(r))

  await recordActivity(db, orgId, {
    eventType: 'CONTACT_UNIFIED',
    entityType: 'contact',
    entityId: targetId,
    contactId: targetId,
    actorType: 'user',
    actorId: user.id,
    metadata: { filled, skipped, addedRoles, via: 'alta' },
  })
  await logAdminAction(event, {
    user,
    orgId,
    action: 'update',
    resource: 'contact',
    resourceId: targetId,
    detail: `unificado con un alta nueva${filled.length ? ` — completado: ${filled.join(', ')}` : ' — sin datos nuevos'}${skipped.length ? ` — no se pisó: ${skipped.join(', ')}` : ''}`,
  })
  return { contact: updated, filled, skipped, addedRoles }
}

/**
 * Alta de un contacto desde el panel (POST /api/admin/contacts): misma
 * deduplicación que Contactos → Nuevo (409 con candidatos salvo `force`),
 * más los roles. Con `mergeIntoContactId` no crea nada: unifica con ese
 * contacto (`unifyIntoContact`).
 */
export async function createContactFromAdmin(event: H3Event, orgId: number, user: SessionUser, body: Record<string, any>) {
  const db = useDb(event)
  const input = contactInputFromBody(body) as ContactInput
  if (!input.name) fail(422, 'El nombre es obligatorio')
  if (!input.email && !input.phone && !input.whatsapp) fail(422, 'Indica al menos un email o un teléfono')
  await assertOwnedRef(db, schema.teamMembers, input.assignedCommercialId, orgId, 'Comercial')
  await assertOwnedRef(db, schema.offices, input.officeId, orgId, 'Oficina')
  const roles = 'roles' in body ? normalizeRoles(body.roles) : []
  if (body.mergeIntoContactId != null && body.mergeIntoContactId !== '') {
    const res = await unifyIntoContact(event, orgId, user, Number(body.mergeIntoContactId), input, roles)
    return { ok: true, id: res.contact.id, merged: true, filled: res.filled, skipped: res.skipped }
  }
  await assertExternalRef(db, orgId, input.externalSource, input.externalId)
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
 * Contactos → «Nuevo contacto» (POST /api/admin/saas/contacts): nombre, tipo,
 * email, teléfono, WhatsApp e id externo, validados igual que la edición.
 * Ante un posible duplicado responde 409 con los candidatos; quien decide
 * elige «Abrir», «Unificar» (`mergeIntoContactId`: completa ese contacto con
 * lo que le falte, ver `unifyIntoContact`) o «Crear igualmente» (`force`).
 * Devuelve la fila del contacto (creado o unificado), como siempre.
 */
export async function createContactFromPanel(event: H3Event, orgId: number, user: SessionUser, body: Record<string, any>) {
  const db = useDb(event)
  const input = contactInputFromBody(body) as ContactInput
  if (!input.name) fail(422, 'El nombre es obligatorio')
  if (!input.email && !input.phone && !input.whatsapp) fail(422, 'Indica al menos un email o un teléfono')
  // Antes esta ruta guardaba el cuerpo tal cual: un comercial u oficina de otra agencia es un 404.
  await assertOwnedRef(db, schema.teamMembers, input.assignedCommercialId, orgId, 'Comercial')
  await assertOwnedRef(db, schema.offices, input.officeId, orgId, 'Oficina')
  if (body.mergeIntoContactId != null && body.mergeIntoContactId !== '') {
    const res = await unifyIntoContact(event, orgId, user, Number(body.mergeIntoContactId), input)
    return { ...res.contact, merged: true, filled: res.filled, skipped: res.skipped }
  }
  await assertExternalRef(db, orgId, input.externalSource, input.externalId)
  // El prefijo configurado por la agencia hace que "600112233" se normalice
  // igual que "+34600112233": sin él ni se detecta el duplicado ni se guarda
  // el teléfono normalizado.
  const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
  const candidates = await findDuplicateContacts(event, orgId, input, { defaultCountryPrefix })
  if (candidates.length && !body.force) fail(409, 'Puede que este contacto ya exista', { duplicates: candidates })
  const contact = await createContact(event, orgId, input, { createdBy: user.id, defaultCountryPrefix })
  await logAdminAction(event, {
    user,
    orgId,
    action: 'create',
    resource: 'contact',
    resourceId: contact.id,
    // Queda constancia de que se creó a sabiendas de que había candidatos.
    detail: candidates.length ? `creado pese a ${candidates.length} posible(s) duplicado(s)` : undefined,
  })
  return contact
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
  // Id externo (FASE 14): la pareja origen + id del estado resultante, libre en la agencia.
  if ('externalId' in input || 'externalSource' in input) {
    const source = 'externalSource' in input ? input.externalSource : existing.externalSource
    const externalId = 'externalId' in input ? input.externalId : existing.externalId
    if (source !== existing.externalSource || externalId !== existing.externalId) await assertExternalRef(db, orgId, source, externalId, id)
  }
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
  // Vincular a alguien es crear algo nuevo sobre la propiedad: no si está en
  // la papelera. Editar un vínculo que ya existía sí se permite.
  const samePropertyAsBefore = !!existing && existing.propertyKind === kind && Number(existing.propertyId) === propertyId
  if (samePropertyAsBefore) await assertPropertyOwned(db, orgId, kind, propertyId)
  else await assertLiveProperty(db, orgId, kind, propertyId, { action: 'vincular a una persona' })
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
    const rows = await selectInChunks(ids, (part) =>
      db
        .select({ id: t.id, reference: t.reference, propertyType: t.propertyType, price: t.price, city: t.city, status: t.status, title: kind === 'developer' ? t.name : t.slug, deletedAt: t.deletedAt })
        .from(t)
        .where(and(eq(t.organizationId, orgId), inArray(t.id, part))),
    )
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

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { propertyState, trashedPropertyMessage } from '../properties/trash'
import { inJsonList, selectInChunks } from '../sqlChunks'
import { recordActivity } from '../activity/service'
import type { PropertyKind } from '../matching/service'

/**
 * Selección de propiedades para una persona (FASE 31 §44-45, migración
 * 0084): «estas propiedades, para esta persona», con orden y una nota por
 * propiedad, de cualquiera de los dos catálogos. Persistente — nunca una
 * lista de ids en la memoria del asistente.
 *
 * Auditado antes de crearla: `favorites` es del visitante web,
 * `asset_export_catalogs` son PDFs sin persona, `property_matches` es el
 * estado comercial de un par necesidad↔inmueble y `property_tours` son
 * visitas encadenadas. Ninguno es este concepto, así que no se reutiliza un
 * catálogo público para otra cosa.
 */

export interface SelectionItemInput {
  propertyId: number
  propertyKind: PropertyKind
  note?: string | null
}

export async function createPropertySelection(
  db: any,
  orgId: number,
  input: { contactId: number; title: string; leadId?: number | null; buyerRequirementId?: number | null; notes?: string | null; items: SelectionItemInput[] },
  opts: { createdBy?: number | null } = {},
) {
  if (!input.items.length) throw createError({ statusCode: 422, statusMessage: 'Una selección necesita al menos una propiedad.' })
  if (input.items.length > 30) throw createError({ statusCode: 422, statusMessage: 'Máximo 30 propiedades por selección.' })

  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, input.contactId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
    .limit(1)
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contacto no encontrado' })
  if (input.leadId) {
    const [lead] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.organizationId, orgId))).limit(1)
    if (!lead) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
  }
  if (input.buyerRequirementId) {
    const [req] = await db
      .select({ id: schema.buyerRequirements.id })
      .from(schema.buyerRequirements)
      .where(and(eq(schema.buyerRequirements.id, input.buyerRequirementId), eq(schema.buyerRequirements.organizationId, orgId)))
      .limit(1)
    if (!req) throw createError({ statusCode: 404, statusMessage: 'Necesidad no encontrada' })
  }
  // Cada propiedad tiene que existir en SU catálogo y ser de esta organización.
  const seen = new Set<string>()
  for (const item of input.items) {
    const key = `${item.propertyKind}:${item.propertyId}`
    if (seen.has(key)) throw createError({ statusCode: 422, statusMessage: 'Hay una propiedad repetida en la selección.' })
    seen.add(key)
    // …y no estar en la papelera: una selección es para enseñarla.
    const state = await propertyState(db, orgId, item.propertyKind, item.propertyId)
    if (state === 'missing') throw createError({ statusCode: 404, statusMessage: `Propiedad ${key} no encontrada` })
    if (state === 'trashed') throw createError({ statusCode: 422, statusMessage: `Propiedad ${key}: ${trashedPropertyMessage('incluirla en una selección')}` })
  }

  const nowTs = now()
  const [selection] = await db
    .insert(schema.propertySelections)
    .values({
      organizationId: orgId,
      contactId: input.contactId,
      leadId: input.leadId ?? null,
      buyerRequirementId: input.buyerRequirementId ?? null,
      title: input.title.trim().slice(0, 200),
      notes: input.notes ? input.notes.slice(0, 2000) : null,
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()
  await db.insert(schema.propertySelectionItems).values(
    input.items.map((item, position) => ({
      selectionId: selection.id,
      propertyId: item.propertyId,
      propertyKind: item.propertyKind,
      position,
      note: item.note ? item.note.slice(0, 500) : null,
      createdAt: nowTs,
    })),
  )
  return getPropertySelection(db, orgId, selection.id)
}

export async function getPropertySelection(db: any, orgId: number, selectionId: number) {
  const [selection] = await db
    .select()
    .from(schema.propertySelections)
    .where(and(eq(schema.propertySelections.id, selectionId), eq(schema.propertySelections.organizationId, orgId)))
    .limit(1)
  if (!selection) return null
  // Los items no llevan organizationId: se leen SIEMPRE a través de una selección ya acotada a la agencia.
  const items = await db
    .select({
      id: schema.propertySelectionItems.id,
      propertyId: schema.propertySelectionItems.propertyId,
      propertyKind: schema.propertySelectionItems.propertyKind,
      position: schema.propertySelectionItems.position,
      note: schema.propertySelectionItems.note,
    })
    .from(schema.propertySelectionItems)
    .where(eq(schema.propertySelectionItems.selectionId, selectionId))
    .orderBy(asc(schema.propertySelectionItems.position), asc(schema.propertySelectionItems.id))
  return { ...selection, items }
}

export async function listPropertySelectionsForContact(db: any, orgId: number, contactId: number) {
  return db
    .select()
    .from(schema.propertySelections)
    .where(and(eq(schema.propertySelections.organizationId, orgId), eq(schema.propertySelections.contactId, contactId)))
    .orderBy(asc(schema.propertySelections.createdAt))
}

/**
 * Añade propiedades a una selección ya existente (núcleo N4: «Crear
 * selección» desde una compatibilidad puede ir a una selección que la
 * persona ya tiene). Mismas reglas que al crearla: cada propiedad existe en
 * SU catálogo y es de esta organización, máximo 30 por selección. Las que ya
 * estaban no se duplican ni dan error: se informa de cuántas se añadieron.
 */
export async function addItemsToPropertySelection(db: any, orgId: number, selectionId: number, items: SelectionItemInput[]) {
  if (!items.length) throw createError({ statusCode: 422, statusMessage: 'Elige al menos una propiedad.' })
  const selection = await getPropertySelection(db, orgId, selectionId)
  if (!selection) throw createError({ statusCode: 404, statusMessage: 'Selección no encontrada' })

  const present = new Set(selection.items.map((i: any) => `${i.propertyKind}:${i.propertyId}`))
  const fresh: SelectionItemInput[] = []
  for (const item of items) {
    const key = `${item.propertyKind}:${item.propertyId}`
    if (present.has(key)) continue
    present.add(key)
    // Mismo criterio que al crear la selección: ajena o inexistente → 404; en la papelera → 422.
    const state = await propertyState(db, orgId, item.propertyKind, item.propertyId)
    if (state === 'missing') throw createError({ statusCode: 404, statusMessage: `Propiedad ${key} no encontrada` })
    if (state === 'trashed') throw createError({ statusCode: 422, statusMessage: `Propiedad ${key}: ${trashedPropertyMessage('incluirla en una selección')}` })
    fresh.push(item)
  }
  if (selection.items.length + fresh.length > 30) throw createError({ statusCode: 422, statusMessage: 'Máximo 30 propiedades por selección.' })

  if (fresh.length) {
    const nowTs = now()
    const start = selection.items.reduce((max: number, i: any) => Math.max(max, Number(i.position) + 1), 0)
    await db.insert(schema.propertySelectionItems).values(
      fresh.map((item, i) => ({
        selectionId,
        propertyId: item.propertyId,
        propertyKind: item.propertyKind,
        position: start + i,
        note: item.note ? item.note.slice(0, 500) : null,
        createdAt: nowTs,
      })),
    )
    await db
      .update(schema.propertySelections)
      .set({ updatedAt: nowTs })
      .where(and(eq(schema.propertySelections.id, selectionId), eq(schema.propertySelections.organizationId, orgId)))
  }
  return { selection: await getPropertySelection(db, orgId, selectionId), added: fresh.length }
}

/** Etiquetas del estado de un inmueble de los dos catálogos (las mismas que el resumen de la ficha). */
const PROPERTY_STATUS_LABELS: Record<string, string> = { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista', available: 'Disponible', reserved: 'Reservada', sold: 'Vendida', rented: 'Alquilada' }

export interface SelectionPropertyInfo {
  name: string
  /** Clave de R2 o URL de la foto principal (portada en obra nueva, imagen principal en 2ª mano). */
  image: string | null
  price: number | null
  status: string | null
  statusLabel: string | null
  /** Zona: la comunidad en obra nueva, la ciudad en 2ª mano. */
  location: string | null
  bedrooms: number | null
  area: number | null
  /** En la papelera: sigue en la selección (es historia), pero no se puede enviar. */
  trashed: boolean
}

/**
 * Lo que se enseña de cada propiedad de una selección, leído en vivo de SU
 * catálogo y siempre de esta agencia (nunca una copia guardada en la
 * selección). Las listas de ids van en un solo parámetro (`inJsonList`): D1
 * admite 100 por consulta. Una propiedad que ya no existe no sale en el mapa.
 */
async function describeSelectionProperties(db: any, orgId: number, items: Array<{ propertyId: number; propertyKind: string }>): Promise<Map<string, SelectionPropertyInfo>> {
  const out = new Map<string, SelectionPropertyInfo>()
  for (const kind of ['agent', 'developer'] as PropertyKind[]) {
    const ids = [...new Set(items.filter((i) => i.propertyKind === kind).map((i) => Number(i.propertyId)))]
    if (!ids.length) continue
    if (kind === 'developer') {
      const D = schema.developerProperties
      const rows: any[] = await db
        .select({ id: D.id, name: D.name, image: D.coverImage, price: D.price, status: D.status, location: D.community, bedrooms: D.bedrooms, area: D.area, deletedAt: D.deletedAt })
        .from(D)
        .where(and(eq(D.organizationId, orgId), inJsonList(D.id, ids)))
      for (const r of rows) out.set(`developer:${r.id}`, toInfo(r, r.name || `Propiedad #${r.id}`))
    } else {
      const A = schema.agentProperties
      const rows: any[] = await db
        .select({ id: A.id, reference: A.reference, street: A.street, image: A.mainImage, price: A.price, status: A.status, location: A.city, bedrooms: A.bedrooms, area: A.area, deletedAt: A.deletedAt })
        .from(A)
        .where(and(eq(A.organizationId, orgId), inJsonList(A.id, ids)))
      for (const r of rows) out.set(`agent:${r.id}`, toInfo(r, r.reference || [r.street, r.location].filter(Boolean).join(', ') || `Propiedad #${r.id}`))
    }
  }
  return out
}

function toInfo(r: any, name: string): SelectionPropertyInfo {
  return {
    name,
    image: r.image || null,
    price: r.price ?? null,
    status: r.status ?? null,
    statusLabel: r.status ? PROPERTY_STATUS_LABELS[r.status] || r.status : null,
    location: r.location || null,
    bedrooms: r.bedrooms ?? null,
    area: r.area ?? null,
    trashed: Boolean(r.deletedAt),
  }
}

/**
 * Las selecciones de una persona con sus propiedades ya nombradas, para la
 * ficha del contacto. El nombre se lee del catálogo en vivo (nunca una copia):
 * una propiedad que ya no existe se queda como «Propiedad #id».
 */
export async function listPropertySelectionsWithItems(db: any, orgId: number, contactId: number) {
  const selections = await listPropertySelectionsForContact(db, orgId, contactId)
  if (!selections.length) return []
  // Por trozos (D1: máximo 100 parámetros por consulta); el orden por posición se rehace al agrupar.
  const items = await selectInChunks<number, any>(
    selections.map((s: any) => s.id as number),
    (part) => db.select().from(schema.propertySelectionItems).where(inArray(schema.propertySelectionItems.selectionId, part)) as Promise<any[]>,
  )
  items.sort((a: any, b: any) => a.position - b.position || a.id - b.id)
  const info = await describeSelectionProperties(db, orgId, items)

  return selections
    .slice()
    .reverse()
    .map((s: any) => ({
      ...s,
      items: items
        .filter((i: any) => i.selectionId === s.id)
        .map((i: any) => ({ propertyId: i.propertyId, propertyKind: i.propertyKind, position: i.position, note: i.note, name: info.get(`${i.propertyKind}:${i.propertyId}`)?.name || `Propiedad #${i.propertyId}` })),
    }))
}

/**
 * La vista propia de una selección (FASE 11, cierre C2 —
 * pages/admin/contactos/selecciones/[id].vue): la selección con su contacto (para
 * enviársela), su necesidad (si la tiene) y cada propiedad, en su orden, con
 * foto, precio, estado y si está en la papelera. `null` si no es de esta
 * agencia — quien llama responde 404, igual que si no existiera.
 */
export async function getPropertySelectionDetail(db: any, orgId: number, selectionId: number) {
  const selection = await getPropertySelection(db, orgId, selectionId)
  if (!selection) return null
  const info = await describeSelectionProperties(db, orgId, selection.items)
  const [contact] = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone, whatsapp: schema.contacts.whatsapp })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, selection.contactId), eq(schema.contacts.organizationId, orgId)))
    .limit(1)
  const [requirement] = selection.buyerRequirementId
    ? await db
        .select({ id: schema.buyerRequirements.id, title: schema.buyerRequirements.title, status: schema.buyerRequirements.status })
        .from(schema.buyerRequirements)
        .where(and(eq(schema.buyerRequirements.id, selection.buyerRequirementId), eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
        .limit(1)
    : []
  return {
    ...selection,
    contact: contact ?? null,
    requirement: requirement ?? null,
    items: selection.items.map((i: any) => {
      const p = info.get(`${i.propertyKind}:${i.propertyId}`)
      return { ...i, ...(p || { name: `Propiedad #${i.propertyId}`, image: null, price: null, status: null, statusLabel: null, location: null, bedrooms: null, area: null, trashed: false }), missing: !p }
    }),
  }
}

/**
 * Reordena las propiedades de una selección: `itemIds` son TODAS sus
 * propiedades en el orden nuevo (cada una exactamente una vez, si no 422).
 * El orden vive en `property_selection_items.position`, la misma columna que
 * ya escribían el alta y «añadir»: no hace falta migración.
 */
export async function reorderPropertySelection(db: any, orgId: number, selectionId: number, itemIds: number[]) {
  const selection = await getPropertySelection(db, orgId, selectionId)
  if (!selection) throw createError({ statusCode: 404, statusMessage: 'Selección no encontrada' })
  const ids = (itemIds || []).map(Number)
  const known = new Set(selection.items.map((i: any) => i.id))
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw createError({ statusCode: 422, statusMessage: 'El orden tiene que incluir cada propiedad de la selección exactamente una vez' })
  }
  const I = schema.propertySelectionItems
  // Un único lote atómico: nadie ve la selección a medio reordenar.
  await db.batch([
    ...ids.map((id, position) => db.update(I).set({ position }).where(and(eq(I.id, id), eq(I.selectionId, selectionId)))),
    db.update(schema.propertySelections).set({ updatedAt: now() }).where(and(eq(schema.propertySelections.id, selectionId), eq(schema.propertySelections.organizationId, orgId))),
  ])
  return getPropertySelection(db, orgId, selectionId)
}

/**
 * Quita una propiedad de una selección (borra su fila de la selección, nunca
 * la propiedad) y deja las demás con posiciones seguidas. Una selección
 * necesita al menos una propiedad, igual que al crearla: quitar la última es 422.
 */
export async function removePropertySelectionItem(db: any, orgId: number, selectionId: number, itemId: number) {
  const selection = await getPropertySelection(db, orgId, selectionId)
  if (!selection) throw createError({ statusCode: 404, statusMessage: 'Selección no encontrada' })
  const item = selection.items.find((i: any) => i.id === Number(itemId))
  if (!item) throw createError({ statusCode: 404, statusMessage: 'Esa propiedad no está en la selección' })
  if (selection.items.length <= 1) throw createError({ statusCode: 422, statusMessage: 'Una selección necesita al menos una propiedad: añade otra antes de quitar ésta.' })

  const I = schema.propertySelectionItems
  const rest = selection.items.filter((i: any) => i.id !== item.id)
  await db.batch([
    db.delete(I).where(and(eq(I.id, item.id), eq(I.selectionId, selectionId))),
    ...rest.flatMap((i: any, position: number) => (i.position === position ? [] : [db.update(I).set({ position }).where(and(eq(I.id, i.id), eq(I.selectionId, selectionId)))])),
    db.update(schema.propertySelections).set({ updatedAt: now() }).where(and(eq(schema.propertySelections.id, selectionId), eq(schema.propertySelections.organizationId, orgId))),
  ])
  return { selection: await getPropertySelection(db, orgId, selectionId), removed: { propertyId: item.propertyId, propertyKind: item.propertyKind } }
}

/** Las propiedades a añadir de la petición, validadas en forma (la pertenencia y la papelera las comprueba `addItemsToPropertySelection`). */
export function parseSelectionItemsToAdd(body: { items?: unknown; propertyId?: unknown; propertyKind?: unknown; note?: unknown }): SelectionItemInput[] {
  const raw: any[] = Array.isArray(body?.items) ? body.items : body?.propertyId != null ? [{ propertyId: body.propertyId, propertyKind: body.propertyKind, note: body.note }] : []
  if (!raw.length) throw createError({ statusCode: 422, statusMessage: 'Elige al menos una propiedad.' })
  if (raw.length > 30) throw createError({ statusCode: 422, statusMessage: 'Máximo 30 propiedades por selección.' })
  return raw.map((it) => {
    const propertyId = Number(it?.propertyId)
    if (!Number.isInteger(propertyId) || propertyId <= 0) throw createError({ statusCode: 422, statusMessage: 'Propiedad no válida' })
    if (it?.propertyKind !== 'agent' && it?.propertyKind !== 'developer') throw createError({ statusCode: 422, statusMessage: 'Catálogo de propiedad no válido (agent o developer)' })
    return { propertyId, propertyKind: it.propertyKind as PropertyKind, note: typeof it?.note === 'string' && it.note.trim() ? it.note.trim() : null }
  })
}

export const SELECTION_ACTIONS = ['reorder', 'remove', 'add'] as const

/**
 * Las acciones de la vista de una selección, desde `PUT
 * /api/admin/property-selections/:id` (motor genérico, sin ruta nueva):
 *
 * - `reorder` → `{ itemIds }` (todas, en el orden nuevo);
 * - `remove`  → `{ itemId }`;
 * - `add`     → `{ items: [{ propertyId, propertyKind, note? }] }` (o un
 *   `propertyId` + `propertyKind`): mismas reglas que al crearla —de esta
 *   agencia en SU catálogo (404), fuera de la papelera (422), sin repetir,
 *   máximo 30— y `PROPERTY_SELECTION_CREATED` («Ampliada») en Activity.
 *
 * Enviarla NO está aquí: el envío como conjunto lo hace el panel con el
 * mecanismo real de «Enviar propiedad» (Centro de Comunicaciones), propiedad
 * a propiedad, que es lo único que puede dejar algo como enviado.
 */
export async function applyPropertySelectionAction(db: any, orgId: number, selectionId: number, body: Record<string, any>, opts: { userId?: number | null } = {}) {
  const action = String(body?.action || '')
  if (action === 'reorder') {
    const selection = await reorderPropertySelection(db, orgId, selectionId, Array.isArray(body.itemIds) ? body.itemIds : [])
    return { ok: true, action, selection, added: [] as SelectionItemInput[] }
  }
  if (action === 'remove') {
    const res = await removePropertySelectionItem(db, orgId, selectionId, Number(body.itemId))
    return { ok: true, action, selection: res.selection, removed: res.removed, added: [] as SelectionItemInput[] }
  }
  if (action === 'add') {
    const items = parseSelectionItemsToAdd(body)
    const before = await getPropertySelection(db, orgId, selectionId)
    if (!before) throw createError({ statusCode: 404, statusMessage: 'Selección no encontrada' })
    const present = new Set(before.items.map((i: any) => `${i.propertyKind}:${i.propertyId}`))
    const res = await addItemsToPropertySelection(db, orgId, selectionId, items)
    const added = items.filter((i, idx) => !present.has(`${i.propertyKind}:${i.propertyId}`) && items.findIndex((j) => j.propertyKind === i.propertyKind && j.propertyId === i.propertyId) === idx)
    if (res.added) {
      await recordActivity(db, orgId, {
        eventType: 'PROPERTY_SELECTION_CREATED',
        entityType: 'property_selection',
        entityId: selectionId,
        contactId: before.contactId,
        leadId: before.leadId ?? null,
        buyerRequirementId: before.buyerRequirementId ?? null,
        actorType: opts.userId ? 'user' : 'system',
        actorId: opts.userId ?? null,
        metadata: { title: before.title, added: res.added, created: false },
      })
    }
    return { ok: true, action, selection: res.selection, added }
  }
  throw createError({ statusCode: 422, statusMessage: 'Acción no reconocida (reorder, remove o add)' })
}

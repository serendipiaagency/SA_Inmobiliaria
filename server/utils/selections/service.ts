import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { propertyState, trashedPropertyMessage } from '../properties/trash'
import { selectInChunks } from '../sqlChunks'
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
  const items = await db
    .select({ propertyId: schema.propertySelectionItems.propertyId, propertyKind: schema.propertySelectionItems.propertyKind, position: schema.propertySelectionItems.position, note: schema.propertySelectionItems.note })
    .from(schema.propertySelectionItems)
    .where(eq(schema.propertySelectionItems.selectionId, selectionId))
    .orderBy(asc(schema.propertySelectionItems.position))
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
  items.sort((a: any, b: any) => a.position - b.position)

  const names = new Map<string, string>()
  for (const kind of ['agent', 'developer'] as PropertyKind[]) {
    const ids = [...new Set(items.filter((i: any) => i.propertyKind === kind).map((i: any) => i.propertyId))] as number[]
    if (!ids.length) continue
    const rows: any[] = await selectInChunks(ids, (part) =>
      kind === 'developer'
        ? db
            .select({ id: schema.developerProperties.id, name: schema.developerProperties.name })
            .from(schema.developerProperties)
            .where(and(eq(schema.developerProperties.organizationId, orgId), inArray(schema.developerProperties.id, part)))
        : db
            .select({ id: schema.agentProperties.id, reference: schema.agentProperties.reference, street: schema.agentProperties.street, city: schema.agentProperties.city })
            .from(schema.agentProperties)
            .where(and(eq(schema.agentProperties.organizationId, orgId), inArray(schema.agentProperties.id, part))),
    )
    for (const r of rows) names.set(`${kind}:${r.id}`, r.name || r.reference || [r.street, r.city].filter(Boolean).join(', ') || `Propiedad #${r.id}`)
  }

  return selections
    .slice()
    .reverse()
    .map((s: any) => ({
      ...s,
      items: items
        .filter((i: any) => i.selectionId === s.id)
        .map((i: any) => ({ propertyId: i.propertyId, propertyKind: i.propertyKind, position: i.position, note: i.note, name: names.get(`${i.propertyKind}:${i.propertyId}`) || `Propiedad #${i.propertyId}` })),
    }))
}

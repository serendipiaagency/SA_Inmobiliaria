import { and, asc, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import type { PropertyKind } from '../matching/service'
import { propertyState, trashedPropertyMessage } from '../properties/trash'

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

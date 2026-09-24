import { and, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { normalizedIdentity } from './service'

/**
 * Fusión de Contact (FASE 14, migraciones 0069 y 0070).
 *
 * Nunca es un DELETE: el duplicado se archiva (soft delete, mismo
 * `deletedAt` que ya usa Contact) y todo lo que colgaba de él —
 * BuyerRequirements, Leads, matches, Clients— se reasigna al que sobrevive.
 * `fields` deja elegir, campo a campo, cuál de los dos valores se queda
 * cuando entran en conflicto (FASE 14 §107: "no sobrescribir email B
 * silenciosamente") — sin `fields`, gana el valor que ya tuviera el
 * superviviente y sólo se rellena lo que tuviera vacío.
 */

export class ContactMergeError extends Error {}

export interface MergePreview {
  master: typeof schema.contacts.$inferSelect
  duplicate: typeof schema.contacts.$inferSelect
  /** Campos donde master y duplicate difieren y hay que elegir cuál se queda. */
  conflicts: { field: 'name' | 'email' | 'phone' | 'whatsapp'; masterValue: string | null; duplicateValue: string | null }[]
  relations: { buyerRequirements: number; leads: number; clients: number }
}

const MERGEABLE_FIELDS = ['name', 'email', 'phone', 'whatsapp'] as const
type MergeableField = (typeof MERGEABLE_FIELDS)[number]

async function loadContact(event: H3Event, orgId: number, id: number) {
  const db = useDb(event)
  return (
    await db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, id), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
      .limit(1)
  )[0]
}

/** Lo que hay que enseñar ANTES de fusionar de verdad: los dos registros, sus conflictos de campo y cuánto se movería. */
export async function previewMerge(event: H3Event, orgId: number, masterId: number, duplicateId: number): Promise<MergePreview> {
  if (masterId === duplicateId) throw new ContactMergeError('No se puede fusionar un contacto consigo mismo')
  const db = useDb(event)

  const master = await loadContact(event, orgId, masterId)
  if (!master) throw new ContactMergeError('Contacto principal no encontrado')
  const duplicate = await loadContact(event, orgId, duplicateId)
  if (!duplicate) throw new ContactMergeError('Contacto duplicado no encontrado')

  const conflicts: MergePreview['conflicts'] = []
  for (const field of MERGEABLE_FIELDS) {
    const masterValue = (master as any)[field] as string | null
    const duplicateValue = (duplicate as any)[field] as string | null
    if (duplicateValue && masterValue && duplicateValue !== masterValue) {
      conflicts.push({ field, masterValue, duplicateValue })
    }
  }

  const [brCount, leadCount, clientCount] = await Promise.all([
    db.select({ id: schema.buyerRequirements.id }).from(schema.buyerRequirements).where(and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, duplicateId))),
    db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, duplicateId))),
    db.select({ id: schema.clients.id }).from(schema.clients).where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.contactId, duplicateId))),
  ])

  return { master, duplicate, conflicts, relations: { buyerRequirements: brCount.length, leads: leadCount.length, clients: clientCount.length } }
}

/**
 * Fusiona de verdad. `fields` resuelve los conflictos detectados por
 * `previewMerge` — un campo ausente de `fields` conserva el valor del
 * superviviente si ya tenía uno, o toma el del duplicado si el superviviente
 * lo tenía vacío (nunca se pierde un dato real por no elegir explícitamente).
 */
export async function mergeContacts(
  event: H3Event,
  orgId: number,
  input: { masterId: number; duplicateId: number; fields?: Partial<Record<MergeableField, string>> },
  opts: { userId?: number | null; defaultCountryPrefix?: string | null } = {},
) {
  const preview = await previewMerge(event, orgId, input.masterId, input.duplicateId)
  const db = useDb(event)
  const nowTs = now()

  // La identidad completa del superviviente TRAS la fusión — no sólo los
  // campos que cambian — para que normalizedIdentity() no borre la
  // normalización de un campo que no se tocó (ver bug evitado: recalcular
  // sólo sobre el patch parcial dejaría normalizedPhone a NULL si nadie
  // eligió explícitamente el teléfono).
  const merged: Record<MergeableField, string | null> = { name: preview.master.name, email: preview.master.email, phone: preview.master.phone, whatsapp: preview.master.whatsapp }
  let changed = false
  for (const field of MERGEABLE_FIELDS) {
    const chosen = input.fields?.[field]
    const duplicateValue = (preview.duplicate as any)[field] as string | null
    if (chosen !== undefined) {
      merged[field] = chosen || null
      changed = true
    } else if (!merged[field] && duplicateValue) {
      merged[field] = duplicateValue
      changed = true
    }
  }

  if (changed) {
    const ident = normalizedIdentity({ name: merged.name || '', email: merged.email, phone: merged.phone, whatsapp: merged.whatsapp }, opts.defaultCountryPrefix)
    await db
      .update(schema.contacts)
      .set({ name: merged.name || preview.master.name, email: merged.email, phone: merged.phone, whatsapp: merged.whatsapp, ...ident, updatedAt: nowTs })
      .where(and(eq(schema.contacts.id, input.masterId), eq(schema.contacts.organizationId, orgId)))
  }

  // Reasignar TODO lo que colgaba del duplicado — nunca se pierde una
  // relación por archivar el contacto que las tenía.
  await db.update(schema.buyerRequirements).set({ contactId: input.masterId, updatedAt: nowTs }).where(and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, input.duplicateId)))
  await db.update(schema.leads).set({ contactId: input.masterId, updatedAt: nowTs }).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, input.duplicateId)))
  await db.update(schema.clients).set({ contactId: input.masterId, updatedAt: nowTs }).where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.contactId, input.duplicateId)))
  // property_matches/developer_property_matches copian contactId de la
  // necesidad al crearse (server/utils/matching/service.ts) — al reasignar
  // buyer_requirements.contactId arriba, cualquier match nuevo ya sale con el
  // contactId correcto. Los ya persistidos con el contactId antiguo son
  // histórico de una decisión tomada en su momento y no se reescriben.

  // OJO si alguien amplía la lista de reasignaciones de arriba:
  // `comms_conversations.contact_id` y `comms_calls.contact_id` se llaman
  // igual pero NO apuntan a esta tabla — apuntan a `comms_contacts`, que es
  // otra entidad con su propia numeración. Moverlas en una fusión reasignaría
  // conversaciones al contacto equivocado del Centro de Comunicaciones.
  // Coinciden en el nombre de la columna, no en lo que significa.

  // Nunca DELETE: se archiva. Un merge revisado más tarde y encontrado
  // erróneo tiene registro de qué pasó (audit log) y el duplicado sigue
  // pudiendo consultarse, sólo que ya no aparece en listados activos.
  //
  // Y se deja escrito HACIA DÓNDE se fue (migración 0070). Sin
  // `mergedIntoContactId`, un id archivado que sigue vivo en un email enviado
  // o en un export antiguo no se puede resolver: "archivado" no distingue una
  // fusión de un borrado. Es además lo único que haría reversible un merge
  // equivocado.
  await db
    .update(schema.contacts)
    .set({
      status: 'archived',
      deletedAt: nowTs,
      updatedAt: nowTs,
      mergedIntoContactId: input.masterId,
      mergedAt: nowTs,
      mergedBy: opts.userId ?? null,
      // Los valores de los dos lados y el elegido, tal y como se vieron en el
      // preview: el "por qué" de la fusión, que seis meses después es lo único
      // que distingue un email descartado a propósito de uno perdido.
      mergeDetailsJson: JSON.stringify({
        masterId: input.masterId,
        duplicateId: input.duplicateId,
        conflicts: preview.conflicts,
        chosen: input.fields ?? {},
        relationsMoved: preview.relations,
      }),
    })
    .where(and(eq(schema.contacts.id, input.duplicateId), eq(schema.contacts.organizationId, orgId)))

  return (await db.select().from(schema.contacts).where(eq(schema.contacts.id, input.masterId)).limit(1))[0]
}

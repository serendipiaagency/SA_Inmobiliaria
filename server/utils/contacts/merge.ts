import { and, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { recordActivity } from '../activity/service'
import { normalizedIdentity } from './service'

/**
 * Fusión de Contact (FASE 14, migración 0069; ampliada en el núcleo N2).
 *
 * Nunca es un DELETE: el duplicado se archiva (soft delete, mismo
 * `deletedAt` que ya usa Contact) y todo lo que colgaba de él se reasigna al
 * que sobrevive — necesidades, leads, clientes, matches, propietarios de
 * propiedades, roles, notas, ofertas y operaciones (como comprador o
 * vendedor), tareas, citas, selecciones, accesos a documentos, etiquetas y
 * campos personalizados (ver `reassignContactLinks`).
 * `fields` deja elegir, campo a campo, cuál de los dos valores se queda
 * cuando entran en conflicto (FASE 14 §107: "no sobrescribir email B
 * silenciosamente") — sin `fields`, gana el valor que ya tuviera el
 * superviviente y sólo se rellena lo que tuviera vacío.
 */

export class ContactMergeError extends Error {}

export interface MergeRelations {
  buyerRequirements: number
  leads: number
  clients: number
  /** Vínculos vivos con propiedades (propietario, copropietario, inquilino…). */
  propertyContacts: number
  roles: number
  notes: number
  tasks: number
  visits: number
  /** Ofertas en las que es comprador o vendedor. */
  offers: number
  /** Operaciones en las que es comprador o vendedor. */
  dealOperations: number
  selections: number
  documentAccess: number
  matches: number
  tags: number
  customFields: number
}

export interface MergePreview {
  master: typeof schema.contacts.$inferSelect
  duplicate: typeof schema.contacts.$inferSelect
  /** Campos donde master y duplicate difieren y hay que elegir cuál se queda. */
  conflicts: { field: 'name' | 'email' | 'phone' | 'whatsapp'; masterValue: string | null; duplicateValue: string | null }[]
  /** Cuánto se movería del duplicado al superviviente. */
  relations: MergeRelations
  /** Por qué NO se puede fusionar (vacío = se puede). */
  blockers: string[]
}

const MERGEABLE_FIELDS = ['name', 'email', 'phone', 'whatsapp'] as const
type MergeableField = (typeof MERGEABLE_FIELDS)[number]

/** Cabecera CRM que el superviviente hereda sólo si la tiene vacía (nunca se pisa un dato suyo). */
const FILL_IF_EMPTY = ['language', 'country', 'source', 'officeId', 'assignedCommercialId'] as const

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

async function countRows(db: any, table: any, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table).where(where)
  return Number(row?.n ?? 0)
}

/** Subconsultas, no listas de ids: una persona con muchas ofertas no puede pasar del límite de 100 parámetros de D1. */
function orgOfferIds(db: any, orgId: number) {
  return db.select({ id: schema.offers.id }).from(schema.offers).where(eq(schema.offers.organizationId, orgId))
}

function orgDealIds(db: any, orgId: number) {
  return db.select({ id: schema.dealOperations.id }).from(schema.dealOperations).where(eq(schema.dealOperations.organizationId, orgId))
}

async function countRelations(db: any, orgId: number, contactId: number): Promise<MergeRelations> {
  const N = schema.notes
  const [
    buyerRequirements,
    leads,
    clients,
    propertyContacts,
    roles,
    notes,
    tasks,
    visits,
    offersAsBuyer,
    offersAsSeller,
    dealsAsBuyer,
    dealsAsSeller,
    selections,
    documentAccess,
    agentMatches,
    developerMatches,
    tags,
    customFields,
  ] = await Promise.all([
    countRows(db, schema.buyerRequirements, and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, contactId))),
    countRows(db, schema.leads, and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, contactId))),
    countRows(db, schema.clients, and(eq(schema.clients.organizationId, orgId), eq(schema.clients.contactId, contactId))),
    countRows(db, schema.propertyContacts, and(eq(schema.propertyContacts.organizationId, orgId), eq(schema.propertyContacts.contactId, contactId), isNull(schema.propertyContacts.deletedAt))),
    countRows(db, schema.contactRoles, and(eq(schema.contactRoles.organizationId, orgId), eq(schema.contactRoles.contactId, contactId))),
    countRows(db, N, and(eq(N.organizationId, orgId), isNull(N.deletedAt), or(eq(N.contactId, contactId), and(eq(N.entityType, 'contact'), eq(N.entityId, contactId))))),
    countRows(db, schema.tasks, and(eq(schema.tasks.organizationId, orgId), eq(schema.tasks.contactId, contactId), isNull(schema.tasks.deletedAt))),
    countRows(db, schema.visits, and(eq(schema.visits.organizationId, orgId), eq(schema.visits.contactId, contactId))),
    countRows(db, schema.offers, and(eq(schema.offers.organizationId, orgId), eq(schema.offers.buyerContactId, contactId))),
    countRows(db, schema.offerSellers, and(eq(schema.offerSellers.contactId, contactId), inArray(schema.offerSellers.offerId, orgOfferIds(db, orgId)))),
    countRows(db, schema.dealOperations, and(eq(schema.dealOperations.organizationId, orgId), eq(schema.dealOperations.buyerContactId, contactId))),
    countRows(db, schema.dealOperationSellers, and(eq(schema.dealOperationSellers.contactId, contactId), inArray(schema.dealOperationSellers.dealOperationId, orgDealIds(db, orgId)))),
    countRows(db, schema.propertySelections, and(eq(schema.propertySelections.organizationId, orgId), eq(schema.propertySelections.contactId, contactId))),
    countRows(db, schema.propertyDocumentAccess, and(eq(schema.propertyDocumentAccess.organizationId, orgId), eq(schema.propertyDocumentAccess.contactId, contactId))),
    countRows(db, schema.propertyMatches, and(eq(schema.propertyMatches.organizationId, orgId), eq(schema.propertyMatches.contactId, contactId))),
    countRows(db, schema.developerPropertyMatches, and(eq(schema.developerPropertyMatches.organizationId, orgId), eq(schema.developerPropertyMatches.contactId, contactId))),
    countRows(db, schema.tagLinks, and(eq(schema.tagLinks.organizationId, orgId), eq(schema.tagLinks.entityType, 'contact'), eq(schema.tagLinks.entityId, contactId))),
    countRows(db, schema.customFieldValues, and(eq(schema.customFieldValues.organizationId, orgId), eq(schema.customFieldValues.entityType, 'contact'), eq(schema.customFieldValues.entityId, contactId))),
  ])
  return {
    buyerRequirements,
    leads,
    clients,
    propertyContacts,
    roles,
    notes,
    tasks,
    visits,
    offers: offersAsBuyer + offersAsSeller,
    dealOperations: dealsAsBuyer + dealsAsSeller,
    selections,
    documentAccess,
    matches: agentMatches + developerMatches,
    tags,
    customFields,
  }
}

/**
 * Una oferta u operación en la que uno es comprador y el otro vendedor dice
 * que son personas distintas: fusionarlos dejaría a alguien comprándose a sí
 * mismo (N6 ya rechaza ese caso al crear una oferta). Se bloquea, no se
 * "arregla" quitando a uno de los dos lados.
 */
async function sideConflicts(db: any, orgId: number, a: number, b: number): Promise<string[]> {
  const O = schema.offers
  const OS = schema.offerSellers
  const D = schema.dealOperations
  const DS = schema.dealOperationSellers
  const [offers, deals] = await Promise.all([
    db
      .select({ id: O.id })
      .from(O)
      .innerJoin(OS, eq(OS.offerId, O.id))
      .where(and(eq(O.organizationId, orgId), or(and(eq(O.buyerContactId, a), eq(OS.contactId, b)), and(eq(O.buyerContactId, b), eq(OS.contactId, a))))),
    db
      .select({ id: D.id })
      .from(D)
      .innerJoin(DS, eq(DS.dealOperationId, D.id))
      .where(and(eq(D.organizationId, orgId), or(and(eq(D.buyerContactId, a), eq(DS.contactId, b)), and(eq(D.buyerContactId, b), eq(DS.contactId, a))))),
  ])
  const out: string[] = []
  for (const o of offers) out.push(`Son comprador y vendedor en la oferta #${o.id}: no pueden ser la misma persona.`)
  for (const d of deals) out.push(`Son comprador y vendedor en la operación #${d.id}: no pueden ser la misma persona.`)
  return out
}

/** Lo que hay que enseñar ANTES de fusionar de verdad: los dos registros, sus conflictos de campo, cuánto se movería y si algo lo impide. */
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

  const [relations, blockers] = await Promise.all([countRelations(db, orgId, duplicateId), sideConflicts(db, orgId, masterId, duplicateId)])
  return { master, duplicate, conflicts, relations, blockers }
}

/** Ids que ya se habían unificado en `contactId` (de sus eventos CONTACT_MERGED), para que una cadena A→B→C no pierda la historia de A. */
async function previouslyMergedInto(db: any, orgId: number, contactId: number): Promise<number[]> {
  const rows: Array<{ metadataJson: string | null }> = await db
    .select({ metadataJson: schema.activities.metadataJson })
    .from(schema.activities)
    .where(and(eq(schema.activities.organizationId, orgId), eq(schema.activities.contactId, contactId), eq(schema.activities.eventType, 'CONTACT_MERGED')))
  const ids: number[] = []
  for (const r of rows) {
    try {
      const meta = JSON.parse(r.metadataJson || '{}')
      for (const id of Array.isArray(meta.mergedContactIds) ? meta.mergedContactIds : []) if (Number.isInteger(id)) ids.push(id)
    } catch {
      // Metadatos ilegibles: no hay nada que heredar de ese evento.
    }
  }
  return ids
}

function joinText(a: string | null, b: string | null): string | null {
  const x = (a || '').trim()
  const y = (b || '').trim()
  if (!x) return y || null
  if (!y || x === y) return x
  return `${x}\n\n${y}`
}

/**
 * Mueve al superviviente todo lo que cuelga del duplicado, siempre dentro de
 * la organización. Donde un índice único impediría mover la fila (el
 * superviviente ya tiene ese rol, ese acceso o ya es vendedor de esa
 * oferta) se borra la del duplicado: es el mismo hecho repetido, no un dato.
 * Lo que no es repetido (un valor de campo personalizado distinto) se queda
 * en el duplicado archivado, nunca se pisa ni se pierde.
 *
 * `activities` no se toca (append-only): la cronología del superviviente
 * incluye la de los contactos unificados en él a través del evento
 * CONTACT_MERGED (ver `listActivity`).
 */
async function reassignContactLinks(db: any, orgId: number, masterId: number, dupId: number, nowTs: string): Promise<void> {
  const byOrg = <T extends { organizationId: any; contactId: any }>(t: T) => and(eq(t.organizationId, orgId), eq(t.contactId, dupId))

  // Lo que ya se movía antes (FASE 14).
  await db.update(schema.buyerRequirements).set({ contactId: masterId, updatedAt: nowTs }).where(byOrg(schema.buyerRequirements))
  await db.update(schema.leads).set({ contactId: masterId, updatedAt: nowTs }).where(byOrg(schema.leads))
  await db.update(schema.clients).set({ contactId: masterId, updatedAt: nowTs }).where(byOrg(schema.clients))

  // Matches: `contactId` es la copia del de su necesidad, que acaba de pasar
  // al superviviente. Sólo cambia a quién apunta — estado, puntuación y
  // motivo de descarte (la decisión que se tomó) quedan igual. Si no, una
  // visita u oferta del superviviente no avanzaría esos matches
  // (`advancePropertyMatches` los busca por contacto).
  await db.update(schema.propertyMatches).set({ contactId: masterId }).where(byOrg(schema.propertyMatches))
  await db.update(schema.developerPropertyMatches).set({ contactId: masterId }).where(byOrg(schema.developerPropertyMatches))

  // Propietarios / inquilinos de propiedades. Primero lo que ya estaba en la
  // papelera (historia: se mueve tal cual); luego, si el superviviente ya
  // figura con el mismo papel en la misma propiedad, una sola fila: la suya,
  // con el % de los dos sumado (la suma de la propiedad no cambia, así que
  // no puede pasar del 100 % si no lo pasaba), principal si lo era
  // cualquiera de las dos y las notas de ambas. La del duplicado va a la
  // papelera y se queda en él. El resto se mueve.
  const PC = schema.propertyContacts
  await db.update(PC).set({ contactId: masterId, updatedAt: nowTs }).where(and(byOrg(PC), isNotNull(PC.deletedAt)))
  const [dupLinks, masterLinks]: any[][] = await Promise.all([
    db.select().from(PC).where(and(byOrg(PC), isNull(PC.deletedAt))),
    db.select().from(PC).where(and(eq(PC.organizationId, orgId), eq(PC.contactId, masterId), isNull(PC.deletedAt))),
  ])
  const masterByKey = new Map<string, any>(masterLinks.map((l) => [`${l.propertyKind}:${l.propertyId}:${l.role}`, l]))
  for (const link of dupLinks) {
    const mine = masterByKey.get(`${link.propertyKind}:${link.propertyId}:${link.role}`)
    if (!mine) continue
    const pct = mine.ownershipPct == null && link.ownershipPct == null ? null : Math.min(100, Number(mine.ownershipPct ?? 0) + Number(link.ownershipPct ?? 0))
    await db
      .update(PC)
      .set({ ownershipPct: pct, isPrimary: mine.isPrimary || link.isPrimary ? 1 : 0, notes: joinText(mine.notes, link.notes), updatedAt: nowTs })
      .where(and(eq(PC.id, mine.id), eq(PC.organizationId, orgId)))
    await db.update(PC).set({ deletedAt: nowTs, updatedAt: nowTs }).where(and(eq(PC.id, link.id), eq(PC.organizationId, orgId)))
  }
  await db.update(PC).set({ contactId: masterId, updatedAt: nowTs }).where(and(byOrg(PC), isNull(PC.deletedAt)))

  // Roles (contact_roles_unique: contacto + rol).
  const CR = schema.contactRoles
  const masterRoles = alias(CR, 'master_roles')
  await db
    .delete(CR)
    .where(and(byOrg(CR), inArray(CR.role, db.select({ role: masterRoles.role }).from(masterRoles).where(and(eq(masterRoles.organizationId, orgId), eq(masterRoles.contactId, masterId))))))
  await db.update(CR).set({ contactId: masterId }).where(byOrg(CR))

  // Accesos a documentos (property_document_access_unique: documento + contacto).
  const PDA = schema.propertyDocumentAccess
  const masterAccess = alias(PDA, 'master_access')
  await db
    .delete(PDA)
    .where(
      and(byOrg(PDA), inArray(PDA.documentId, db.select({ id: masterAccess.documentId }).from(masterAccess).where(and(eq(masterAccess.organizationId, orgId), eq(masterAccess.contactId, masterId))))),
    )
  await db.update(PDA).set({ contactId: masterId }).where(byOrg(PDA))

  // Notas: las de la persona (entityType contact) y la columna
  // desnormalizada `contactId` de las que cuelgan de sus leads.
  const N = schema.notes
  await db.update(N).set({ contactId: masterId }).where(byOrg(N))
  await db
    .update(N)
    .set({ entityId: masterId })
    .where(and(eq(N.organizationId, orgId), eq(N.entityType, 'contact'), eq(N.entityId, dupId)))

  // Tareas, citas y selecciones de propiedades.
  await db.update(schema.tasks).set({ contactId: masterId, updatedAt: nowTs }).where(byOrg(schema.tasks))
  await db.update(schema.visits).set({ contactId: masterId }).where(byOrg(schema.visits))
  await db.update(schema.propertySelections).set({ contactId: masterId, updatedAt: nowTs }).where(byOrg(schema.propertySelections))

  // Ofertas y operaciones: como comprador...
  await db
    .update(schema.offers)
    .set({ buyerContactId: masterId, updatedAt: nowTs })
    .where(and(eq(schema.offers.organizationId, orgId), eq(schema.offers.buyerContactId, dupId)))
  await db
    .update(schema.dealOperations)
    .set({ buyerContactId: masterId, updatedAt: nowTs })
    .where(and(eq(schema.dealOperations.organizationId, orgId), eq(schema.dealOperations.buyerContactId, dupId)))
  // ...y como vendedor (offer_sellers_unique / deal_operation_sellers_unique).
  const OS = schema.offerSellers
  const masterOffers = alias(OS, 'master_offers')
  const dupSells = and(eq(OS.contactId, dupId), inArray(OS.offerId, orgOfferIds(db, orgId)))
  await db.delete(OS).where(and(dupSells, inArray(OS.offerId, db.select({ id: masterOffers.offerId }).from(masterOffers).where(eq(masterOffers.contactId, masterId)))))
  await db.update(OS).set({ contactId: masterId }).where(dupSells)
  const DS = schema.dealOperationSellers
  const masterDeals = alias(DS, 'master_deals')
  const dupDeals = and(eq(DS.contactId, dupId), inArray(DS.dealOperationId, orgDealIds(db, orgId)))
  await db
    .delete(DS)
    .where(and(dupDeals, inArray(DS.dealOperationId, db.select({ id: masterDeals.dealOperationId }).from(masterDeals).where(eq(masterDeals.contactId, masterId)))))
  await db.update(DS).set({ contactId: masterId }).where(dupDeals)

  // Etiquetas (tag_links_unique: etiqueta + entidad).
  const TL = schema.tagLinks
  const masterTags = alias(TL, 'master_tags')
  const dupTags = and(eq(TL.organizationId, orgId), eq(TL.entityType, 'contact'), eq(TL.entityId, dupId))
  await db
    .delete(TL)
    .where(
      and(
        dupTags,
        inArray(
          TL.tagId,
          db
            .select({ id: masterTags.tagId })
            .from(masterTags)
            .where(and(eq(masterTags.organizationId, orgId), eq(masterTags.entityType, 'contact'), eq(masterTags.entityId, masterId))),
        ),
      ),
    )
  await db.update(TL).set({ entityId: masterId }).where(dupTags)

  // Campos personalizados: sólo los que el superviviente no tiene; un valor
  // distinto del duplicado se queda en él (archivado), no pisa el suyo.
  const CF = schema.customFieldValues
  const masterValues = alias(CF, 'master_values')
  await db
    .update(CF)
    .set({ entityId: masterId, updatedAt: nowTs })
    .where(
      and(
        eq(CF.organizationId, orgId),
        eq(CF.entityType, 'contact'),
        eq(CF.entityId, dupId),
        notInArray(
          CF.definitionId,
          db
            .select({ id: masterValues.definitionId })
            .from(masterValues)
            .where(and(eq(masterValues.organizationId, orgId), eq(masterValues.entityType, 'contact'), eq(masterValues.entityId, masterId))),
        ),
      ),
    )
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
  if (preview.blockers.length) throw new ContactMergeError(preview.blockers.join(' '))
  const db = useDb(event)
  const nowTs = now()
  const master = preview.master as any
  const duplicate = preview.duplicate as any

  // La identidad completa del superviviente TRAS la fusión — no sólo los
  // campos que cambian — para que normalizedIdentity() no borre la
  // normalización de un campo que no se tocó (ver bug evitado: recalcular
  // sólo sobre el patch parcial dejaría normalizedPhone a NULL si nadie
  // eligió explícitamente el teléfono).
  const merged: Record<MergeableField, string | null> = { name: master.name, email: master.email, phone: master.phone, whatsapp: master.whatsapp }
  let identityChanged = false
  for (const field of MERGEABLE_FIELDS) {
    const chosen = input.fields?.[field]
    const duplicateValue = duplicate[field] as string | null
    if (chosen !== undefined) {
      merged[field] = chosen || null
      identityChanged = true
    } else if (!merged[field] && duplicateValue) {
      merged[field] = duplicateValue
      identityChanged = true
    }
  }

  // Cabecera CRM: lo que el superviviente tenga vacío lo hereda del duplicado.
  const header: Record<string, unknown> = {}
  for (const field of FILL_IF_EMPTY) if (!master[field] && duplicate[field]) header[field] = duplicate[field]
  if (!master.nextActionType && !master.nextActionAt && (duplicate.nextActionType || duplicate.nextActionAt)) {
    header.nextActionType = duplicate.nextActionType
    header.nextActionAt = duplicate.nextActionAt
  }
  if (duplicate.lastContactAt && (!master.lastContactAt || duplicate.lastContactAt > master.lastContactAt)) header.lastContactAt = duplicate.lastContactAt
  const notes = joinText(master.notes, duplicate.notes)
  if (notes !== (master.notes ?? null)) header.notes = notes

  if (identityChanged || Object.keys(header).length) {
    const ident = identityChanged ? normalizedIdentity({ name: merged.name || '', email: merged.email, phone: merged.phone, whatsapp: merged.whatsapp }, opts.defaultCountryPrefix) : {}
    await db
      .update(schema.contacts)
      .set({
        ...(identityChanged ? { name: merged.name || master.name, email: merged.email, phone: merged.phone, whatsapp: merged.whatsapp, ...ident } : {}),
        ...header,
        updatedAt: nowTs,
      })
      .where(and(eq(schema.contacts.id, input.masterId), eq(schema.contacts.organizationId, orgId)))
  }

  // Reasignar TODO lo que colgaba del duplicado — nunca se pierde una
  // relación por archivar el contacto que las tenía.
  const alreadyMerged = await previouslyMergedInto(db, orgId, input.duplicateId)
  await reassignContactLinks(db, orgId, input.masterId, input.duplicateId, nowTs)

  // Nunca DELETE: se archiva. Un merge revisado más tarde y encontrado
  // erróneo tiene registro de qué pasó (audit log + CONTACT_MERGED) y el
  // duplicado sigue pudiendo consultarse, sólo que ya no aparece en
  // listados activos.
  await db
    .update(schema.contacts)
    .set({ status: 'archived', deletedAt: nowTs, updatedAt: nowTs })
    .where(and(eq(schema.contacts.id, input.duplicateId), eq(schema.contacts.organizationId, orgId)))

  // Deja constancia en la cronología del superviviente, y con ello la de los
  // contactos unificados pasa a verse en ella (`listActivity`).
  await recordActivity(db, orgId, {
    eventType: 'CONTACT_MERGED',
    entityType: 'contact',
    entityId: input.masterId,
    contactId: input.masterId,
    actorType: 'user',
    actorId: opts.userId ?? null,
    metadata: { mergedContactIds: [...new Set([input.duplicateId, ...alreadyMerged])], mergedName: duplicate.name },
  })

  return (await db.select().from(schema.contacts).where(eq(schema.contacts.id, input.masterId)).limit(1))[0]
}


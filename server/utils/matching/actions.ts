import { and, desc, eq, isNull, notInArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema } from '../db'
import { recordActivity } from '../activity/service'
import { createAdminAppointment } from '../appointments/adminCreate'
import { addItemsToPropertySelection, createPropertySelection, getPropertySelection, type SelectionItemInput } from '../selections/service'
import { MatchStatusError, PROPERTY_KINDS, setMatchStatus, tablesFor, type PropertyKind } from './service'

/**
 * Acciones sobre una compatibilidad (FASE 11, núcleo N4): crear selección y
 * crear visita desde cualquier vista del matching — la ficha de propiedad
 * («Compradores compatibles»), Compatibilidades y la pestaña «Necesidades»
 * del contacto. Las otras dos acciones ya tenían su sitio y no se duplican:
 *
 * - **Enviar propiedad** es el envío real del Centro de Comunicaciones
 *   (`share-property.post.ts` con `buyerRequirementId`): sólo marca el match
 *   como enviado cuando el proveedor acepta el mensaje.
 * - **Descartar** es `setMatchStatus(… 'discarded')`, con su motivo.
 *
 * Crear selección reutiliza el servicio de selecciones de INMO
 * (`create_property_selection`) y crear visita, `createAdminAppointment()`
 * (Calendar y la tool `book_viewing`): ni una tabla ni una validación nuevas.
 *
 * Aislamiento: la necesidad, su contacto, cada propiedad y la selección
 * existente se comprueban contra la organización de la sesión; lo que no es
 * de esta agencia responde 404, igual que si no existiera.
 */

async function loadRequirementWithContact(event: H3Event, orgId: number, buyerRequirementId: number) {
  const db = useDb(event)
  if (!Number.isInteger(buyerRequirementId) || buyerRequirementId <= 0) throw new MatchStatusError('Falta la necesidad')
  const [requirement] = await db
    .select()
    .from(schema.buyerRequirements)
    .where(and(eq(schema.buyerRequirements.id, buyerRequirementId), eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
    .limit(1)
  if (!requirement) throw new MatchStatusError('Necesidad no encontrada', 404)
  const [contact] = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone, whatsapp: schema.contacts.whatsapp })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, requirement.contactId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
    .limit(1)
  if (!contact) throw new MatchStatusError('Contacto no encontrado', 404)
  return { requirement, contact }
}

function parseKind(value: unknown): PropertyKind {
  if (value === undefined || value === null || value === '') return 'agent'
  if (!(PROPERTY_KINDS as string[]).includes(String(value))) throw new MatchStatusError('Catálogo de propiedad no válido')
  return value as PropertyKind
}

/** Los pares (propiedad, catálogo) de la petición, validados en forma (la pertenencia la comprueba el servicio). */
export function parseSelectionItems(body: { items?: unknown; propertyId?: unknown; propertyKind?: unknown }): SelectionItemInput[] {
  const raw = Array.isArray(body.items) ? body.items : body.propertyId != null ? [{ propertyId: body.propertyId, propertyKind: body.propertyKind }] : []
  if (!raw.length) throw new MatchStatusError('Elige al menos una propiedad')
  if (raw.length > 30) throw new MatchStatusError('Máximo 30 propiedades por selección')
  return raw.map((it: any) => {
    const propertyId = Number(it?.propertyId)
    if (!Number.isInteger(propertyId) || propertyId <= 0) throw new MatchStatusError('Propiedad no válida')
    return { propertyId, propertyKind: parseKind(it?.propertyKind), note: typeof it?.note === 'string' ? it.note : null }
  })
}

/**
 * Elegir una propiedad para una persona (meterla en una selección, agendarle
 * una visita) es seleccionarla: el match pasa a «seleccionado» — sólo si
 * no había decisión o estaba en «nuevo». Nunca retrocede un enviado,
 * visitado u ofertado, y nunca resucita un descarte: eso lo decide una
 * persona desde el propio match.
 */
async function markSelectedIfNew(event: H3Event, orgId: number, input: { buyerRequirementId: number; propertyId: number; propertyKind: PropertyKind }, userId: number | null) {
  const db = useDb(event)
  const { match: M } = tablesFor(input.propertyKind)
  const [existing] = await db
    .select({ status: M.status })
    .from(M)
    .where(and(eq(M.organizationId, orgId), eq(M.buyerRequirementId, input.buyerRequirementId), eq(M.propertyId, input.propertyId)))
    .limit(1)
  if (existing && existing.status !== 'new') return existing.status as string
  await setMatchStatus(event, orgId, { ...input, status: 'selected' }, { userId })
  return 'selected'
}

export interface SelectionFromMatchInput {
  buyerRequirementId: number
  items: SelectionItemInput[]
  title?: string | null
  notes?: string | null
  /** Añadir a esta selección (tiene que ser de la misma persona) en vez de crear otra. */
  selectionId?: number | null
}

/**
 * «Crear selección»: una selección persistente para el contacto de la
 * necesidad, con las propiedades elegidas — o esas propiedades añadidas a
 * una selección suya que ya existía.
 */
export async function createSelectionFromMatch(event: H3Event, orgId: number, input: SelectionFromMatchInput, opts: { userId?: number | null } = {}) {
  const db = useDb(event)
  const { requirement, contact } = await loadRequirementWithContact(event, orgId, input.buyerRequirementId)

  let selection: any
  let added: number
  let created: boolean
  if (input.selectionId) {
    const existing = await getPropertySelection(db, orgId, Number(input.selectionId))
    // Una selección de otra persona (o de otra agencia) no existe para esta necesidad.
    if (!existing || existing.contactId !== contact.id) throw new MatchStatusError('Selección no encontrada', 404)
    const res = await addItemsToPropertySelection(db, orgId, existing.id, input.items)
    selection = res.selection
    added = res.added
    created = false
  } else {
    const title = (input.title || '').trim() || `Selección para ${contact.name}${requirement.title ? ` — ${requirement.title}` : ''}`
    selection = await createPropertySelection(
      db,
      orgId,
      { contactId: contact.id, buyerRequirementId: requirement.id, title, notes: input.notes ?? null, items: input.items },
      { createdBy: opts.userId ?? null },
    )
    added = input.items.length
    created = true
  }

  for (const item of input.items) {
    await markSelectedIfNew(event, orgId, { buyerRequirementId: requirement.id, propertyId: item.propertyId, propertyKind: item.propertyKind }, opts.userId ?? null)
  }

  if (created || added) {
    await recordActivity(db, orgId, {
      eventType: 'PROPERTY_SELECTION_CREATED',
      entityType: 'property_selection',
      entityId: selection.id,
      contactId: contact.id,
      buyerRequirementId: requirement.id,
      actorType: opts.userId ? 'user' : 'system',
      actorId: opts.userId ?? null,
      metadata: { title: selection.title, added, created },
    })
  }

  return { selection, added, created }
}

export interface VisitFromMatchInput {
  buyerRequirementId: number
  propertyId: number
  propertyKind: PropertyKind
  agentId: number
  scheduledAt: string
  channel?: string
}

/**
 * «Crear visita»: una cita de visita para el contacto de la necesidad en este
 * inmueble, por `createAdminAppointment()` — misma validación que Calendar
 * (comercial de la agencia, inmueble de la agencia, solape real en su
 * agenda). El nombre, email y teléfono salen del contacto en el servidor,
 * nunca del navegador.
 */
export async function createVisitFromMatch(event: H3Event, orgId: number, input: VisitFromMatchInput, opts: { userId?: number | null } = {}) {
  const db = useDb(event)
  const { requirement, contact } = await loadRequirementWithContact(event, orgId, input.buyerRequirementId)
  if (!Number.isInteger(input.agentId) || input.agentId <= 0) throw new MatchStatusError('Elige el comercial que hará la visita')
  if (!Number.isInteger(input.propertyId) || input.propertyId <= 0) throw new MatchStatusError('Falta el inmueble')
  const phone = contact.phone || contact.whatsapp || null
  if (!contact.email && !phone) {
    throw new MatchStatusError(`${contact.name} no tiene email ni teléfono: añádelos en su ficha antes de agendarle una visita.`)
  }

  // El lead abierto más reciente de esa persona, si lo tiene: así la visita
  // cuenta como su primera cita (SLA) y aparece en la ficha del lead.
  const [openLead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, contact.id), isNull(schema.leads.deletedAt), notInArray(schema.leads.status, ['won', 'lost'])))
    .orderBy(desc(schema.leads.id))
    .limit(1)

  const visit = await createAdminAppointment(db, orgId, {
    clientName: contact.name,
    clientEmail: contact.email || null,
    clientPhone: phone,
    contactId: contact.id,
    leadId: openLead?.id ?? null,
    createdBy: opts.userId ?? null,
    agentId: input.agentId,
    propertyId: input.propertyId,
    propertyKind: input.propertyKind,
    scheduledAt: input.scheduledAt,
    channel: input.channel,
    type: 'property_viewing',
  })

  const matchStatus = await markSelectedIfNew(event, orgId, { buyerRequirementId: requirement.id, propertyId: input.propertyId, propertyKind: input.propertyKind }, opts.userId ?? null)
  return { visit, matchStatus }
}

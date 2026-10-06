import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { listBuyerRequirements, summarizeRequirement } from '../../../../utils/buyerRequirements/service'
import { listPersonCommunications } from '../../../../utils/comms/related'
import { listContactProperties, listContactRoles } from '../../../../utils/contacts/crm'
import { listPropertySelectionsWithItems } from '../../../../utils/selections/service'
import { listContactDocuments } from '../../../../utils/properties/documents'

/**
 * Ficha de un contacto: sus datos, sus necesidades, los leads/clientes que le
 * pertenecen y sus comunicaciones (FASE 29 §140/§142) — la operación
 * (`deal-operations/[id].vue`) ya pide esta misma ficha para el comprador, así
 * que también las ve sin una ruta nueva.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Id inválido' })

  const db = useDb(event)
  const contact = (
    await db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, id), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
      .limit(1)
  )[0]
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contacto no encontrado' })

  const requirements = await listBuyerRequirements(event, orgId, { contactId: id })

  const leads = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      email: schema.leads.email,
      source: schema.leads.source,
      status: schema.leads.status,
      stage: schema.leads.stage,
      score: schema.leads.score,
      propertyName: schema.leads.propertyName,
      lastContactAt: schema.leads.lastContactAt,
      nextActionType: schema.leads.nextActionType,
      nextActionAt: schema.leads.nextActionAt,
      createdAt: schema.leads.createdAt,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, id)))
    .orderBy(desc(schema.leads.id))

  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, email: schema.clients.email, type: schema.clients.type, stage: schema.clients.stage })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.contactId, id)))

  const communications = await listPersonCommunications(db, orgId, {
    leadIds: leads.map((l) => l.id),
    clientIds: clients.map((c) => c.id),
    // Núcleo N8a: los hilos (WhatsApp y web) que tienen guardado este Contact.
    contactIds: [id],
    emails: [contact.email, ...leads.map((l) => l.email), ...clients.map((c) => c.email)],
  })

  // CRM 360 (FASE 9): roles, propiedades en las que figura, citas, nombre del
  // comercial y de la oficina, score y último contacto — todo de esta
  // organización. Tareas, ofertas, notas y actividad tienen su propio
  // listado filtrable (saas/tasks, saas/offers, notes, saas/activity) que la
  // ficha pide por pestaña.
  const roles = await listContactRoles(db, orgId, id)
  const properties = await listContactProperties(db, orgId, id)

  const leadIds = leads.map((l) => l.id)
  const visitConds = [eq(schema.visits.contactId, id)]
  if (leadIds.length) visitConds.push(inArray(schema.visits.leadId, leadIds))
  if (contact.normalizedEmail) visitConds.push(sql`lower(${schema.visits.clientEmail}) = ${contact.normalizedEmail}`)
  const visits = await db
    .select({
      id: schema.visits.id,
      type: schema.visits.type,
      status: schema.visits.status,
      scheduledAt: schema.visits.scheduledAt,
      propertyName: schema.visits.propertyName,
      agentName: schema.visits.agentName,
      outcome: schema.visits.outcome,
      interestLevel: schema.visits.interestLevel,
    })
    .from(schema.visits)
    .where(and(eq(schema.visits.organizationId, orgId), or(...visitConds), isNull(schema.visits.deletedAt)))
    .orderBy(desc(schema.visits.scheduledAt))
    .limit(100)

  const [commercial] = contact.assignedCommercialId
    ? await db
        .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.id, contact.assignedCommercialId), eq(schema.teamMembers.organizationId, orgId)))
        .limit(1)
    : []
  const [office] = contact.officeId
    ? await db
        .select({ id: schema.offices.id, name: schema.offices.name })
        .from(schema.offices)
        .where(and(eq(schema.offices.id, contact.officeId), eq(schema.offices.organizationId, orgId)))
        .limit(1)
    : []

  // El score de la persona es el mejor de sus leads (cada lead se puntúa con
  // su explicación propia en Leads); el último contacto, el más reciente
  // entre la ficha y sus leads.
  const score = leads.reduce<number | null>((max, l) => (typeof l.score === 'number' && (max === null || l.score > max) ? l.score : max), null)
  const lastContactAt = [contact.lastContactAt, ...leads.map((l) => l.lastContactAt)].filter(Boolean).sort().pop() || null

  // Documentos (FASE 6, bloque N7a): los que esta persona puede ver, cada uno
  // con el porqué — como propietario o copropietario de la propiedad (si el
  // documento es al menos «propietario»), por acceso concedido (si es al
  // menos «comprador autorizado») o porque es público y la propiedad está
  // publicada. Los concedidos que con la visibilidad actual no dan acceso
  // salen marcados. Nada de otra agencia ni de la papelera; las listas de ids
  // van por trozos (límite de 100 parámetros de D1).
  const documents = await listContactDocuments(db, orgId, [id], { includeInactiveGrants: true })

  // Selecciones de propiedades preparadas para esta persona (INMO o
  // «Crear selección» desde una compatibilidad, núcleo N4).
  const selections = await listPropertySelectionsWithItems(db, orgId, id)

  return {
    contact: { ...contact, roles, commercialName: commercial?.name ?? null, officeName: office?.name ?? null, score, lastContactAt },
    requirements: requirements.map((r) => ({ ...r, summary: summarizeRequirement(r) })),
    leads,
    clients,
    communications,
    properties,
    visits,
    documents,
    selections,
  }
})

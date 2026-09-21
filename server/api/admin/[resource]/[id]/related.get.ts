import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { schema, useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getResource } from '../../../../utils/adminResources'
import { authorizeRecord } from '../../../../utils/tenantPolicy'

/**
 * La vista 360º de un cliente: todo lo que la agencia tiene registrado sobre
 * esa persona, **derivado de tablas reales**, nunca inventado.
 *
 * ## Cómo se relaciona un cliente con lo demás, y por qué así
 *
 * Auditado antes de escribir esto: **no existe ninguna clave foránea a
 * `clients`**. Ni `leads`, ni `visits`, ni `deals`, ni `reservations`, ni
 * `contracts`, ni `invoices` tienen `client_id`; todas guardan el nombre
 * (`client_name`) y algunas el email (`client_email`). El propio código ya lo
 * reconocía en dos sitios: `performance.get.ts` excluye a los clientes de las
 * métricas del comercial «porque `clients` no tiene `agentId`», y los
 * endpoints de RGPD (`saas/gdpr/*`) localizan a una persona **por email** en
 * todas esas tablas.
 *
 * Así que el vínculo se deriva igual que ya hace RGPD: **por email cuando lo
 * hay, y por nombre exacto**. No es lo mismo que una relación guardada y la
 * interfaz lo dice: dos clientes con el mismo nombre y sin email compartirían
 * histórico. Convertir esto en claves foráneas de verdad es una migración con
 * relleno sobre datos vivos — una decisión del propietario, no un efecto
 * secundario de esta pantalla.
 *
 * ## Propiedades
 *
 * No se guarda ninguna copia. Se recogen los `property_id` que aparecen en
 * visitas, operaciones, reservas y leads de esta persona y se resuelven **en
 * vivo** contra el catálogo. `visits.property_id` apunta a
 * `developer_properties` (es lo que escribe el único que lo rellena,
 * `public/agents/[slug]/book.post.ts`); si un id no está ahí se busca en
 * `agent_properties`, y cada tarjeta sabe de qué catálogo salió para enlazar
 * a la ficha correcta.
 *
 * Cada propiedad lleva **por qué** está relacionada (visita, operación,
 * reserva, interés de un lead). Son relaciones distintas y se muestran como
 * tales, no fundidas en una lista genérica.
 */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (key !== 'clients') throw createError({ statusCode: 404, statusMessage: 'Related records are not supported for this resource' })

  const { orgId } = await requireOrgScope(event, def.area, 'read')
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // La misma comprobación que usa el resto del motor genérico: la fila tiene
  // que ser de esta organización. Sin esto, /api/admin/clients/<id ajeno>/related
  // devolvería el histórico de un cliente de otra inmobiliaria.
  await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  const [client] = await db
    .select({ name: schema.clients.name, email: schema.clients.email })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, id), eq(schema.clients.organizationId, orgId)))
    .limit(1)
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const email = client.email ? client.email.trim().toLowerCase() : null
  const name = client.name

  /** Coincide por email (sin distinguir mayúsculas) o por nombre exacto. */
  const matches = (nameCol: any, emailCol: any | null) => {
    const byName = eq(nameCol, name)
    if (!email || !emailCol) return byName
    return or(byName, sql`lower(${emailCol}) = ${email}`)
  }

  const [leads, visits, deals, reservations, contracts, invoices, activity] = await Promise.all([
    db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), matches(schema.leads.name, schema.leads.email)))
      .orderBy(desc(schema.leads.createdAt))
      .limit(50),
    db
      .select()
      .from(schema.visits)
      .where(and(eq(schema.visits.organizationId, orgId), matches(schema.visits.clientName, schema.visits.clientEmail)))
      .orderBy(desc(schema.visits.scheduledAt))
      .limit(50),
    db
      .select()
      .from(schema.deals)
      .where(and(eq(schema.deals.organizationId, orgId), eq(schema.deals.clientName, name)))
      .orderBy(desc(schema.deals.closedAt))
      .limit(50),
    db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.organizationId, orgId), eq(schema.reservations.clientName, name)))
      .orderBy(desc(schema.reservations.reservedAt))
      .limit(50),
    db
      .select()
      .from(schema.contracts)
      .where(and(eq(schema.contracts.organizationId, orgId), matches(schema.contracts.clientName, schema.contracts.clientEmail)))
      .orderBy(desc(schema.contracts.createdAt))
      .limit(50),
    db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.organizationId, orgId), eq(schema.invoices.clientName, name)))
      .orderBy(desc(schema.invoices.issuedAt))
      .limit(50),
    // Lo que el panel ha hecho con esta ficha. Existe desde que Clientes
    // entró en el motor genérico: cada alta, edición y borrado queda aquí.
    db
      .select()
      .from(schema.adminAuditLog)
      .where(and(eq(schema.adminAuditLog.organizationId, orgId), eq(schema.adminAuditLog.resource, 'clients'), eq(schema.adminAuditLog.resourceId, String(id))))
      .orderBy(desc(schema.adminAuditLog.createdAt))
      .limit(50),
  ])

  // --- Comunicaciones (WhatsApp y llamadas) ---------------------------------
  // Aquí SÍ hay vínculo guardado: comms_contacts.client_id lo escribe el
  // Centro de Comunicaciones al cruzar el teléfono o al vincular a mano.
  const commsContacts = await db
    .select({ id: schema.commsContacts.id })
    .from(schema.commsContacts)
    .where(and(eq(schema.commsContacts.organizationId, orgId), eq(schema.commsContacts.clientId, id)))
  const contactIds = commsContacts.map((c) => c.id)
  const [conversations, messages, calls] = contactIds.length
    ? await Promise.all([
        db
          .select({ id: schema.commsConversations.id, status: schema.commsConversations.status, lastMessageAt: schema.commsConversations.lastMessageAt, lastMessagePreview: schema.commsConversations.lastMessagePreview, unreadCount: schema.commsConversations.unreadCount, contactId: schema.commsConversations.contactId })
          .from(schema.commsConversations)
          .where(and(eq(schema.commsConversations.organizationId, orgId), inArray(schema.commsConversations.contactId, contactIds)))
          .orderBy(desc(schema.commsConversations.lastMessageAt))
          .limit(10),
        db
          .select({ id: schema.commsMessages.id, conversationId: schema.commsMessages.conversationId, direction: schema.commsMessages.direction, type: schema.commsMessages.type, body: schema.commsMessages.body, status: schema.commsMessages.status, createdAt: schema.commsMessages.createdAt })
          .from(schema.commsMessages)
          .innerJoin(schema.commsConversations, eq(schema.commsConversations.id, schema.commsMessages.conversationId))
          .where(and(eq(schema.commsMessages.organizationId, orgId), inArray(schema.commsConversations.contactId, contactIds)))
          .orderBy(desc(schema.commsMessages.id))
          .limit(50),
        db
          .select({ id: schema.commsCalls.id, conversationId: schema.commsCalls.conversationId, direction: schema.commsCalls.direction, provider: schema.commsCalls.provider, status: schema.commsCalls.status, outcome: schema.commsCalls.outcome, notes: schema.commsCalls.notes, durationSeconds: schema.commsCalls.durationSeconds, startedAt: schema.commsCalls.startedAt, createdAt: schema.commsCalls.createdAt })
          .from(schema.commsCalls)
          .where(and(eq(schema.commsCalls.organizationId, orgId), inArray(schema.commsCalls.contactId, contactIds)))
          .orderBy(desc(schema.commsCalls.id))
          .limit(50),
      ])
    : [[], [], []]

  // --- Propiedades relacionadas, resueltas en vivo -------------------------
  const RELATION_LABELS = { visit: 'Visita', deal: 'Operación', reservation: 'Reserva', lead: 'Interés' } as const
  type RelationKey = keyof typeof RELATION_LABELS

  const relationsByProperty = new Map<number, Set<RelationKey>>()
  const note = (propertyId: number | null | undefined, relation: RelationKey) => {
    if (!propertyId) return
    if (!relationsByProperty.has(propertyId)) relationsByProperty.set(propertyId, new Set())
    relationsByProperty.get(propertyId)!.add(relation)
  }
  for (const v of visits) note(v.propertyId, 'visit')
  for (const d of deals) note(d.propertyId, 'deal')
  for (const r of reservations) note(r.propertyId, 'reservation')
  for (const l of leads) note(l.propertyId, 'lead')

  const propertyIds = [...relationsByProperty.keys()]
  const properties: any[] = []
  if (propertyIds.length) {
    const [devRows, agentRows] = await Promise.all([
      db
        .select({
          id: schema.developerProperties.id,
          name: schema.developerProperties.name,
          slug: schema.developerProperties.slug,
          price: schema.developerProperties.price,
          city: schema.developerProperties.city,
          community: schema.developerProperties.community,
          propertyType: schema.developerProperties.propertyType,
          status: schema.developerProperties.status,
          image: schema.developerProperties.coverImage,
          publishedAt: schema.developerProperties.publishedAt,
        })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.organizationId, orgId), inArray(schema.developerProperties.id, propertyIds))),
      db
        .select({
          id: schema.agentProperties.id,
          slug: schema.agentProperties.slug,
          price: schema.agentProperties.price,
          city: schema.agentProperties.city,
          community: schema.agentProperties.community,
          propertyType: schema.agentProperties.propertyType,
          status: schema.agentProperties.status,
          image: schema.agentProperties.mainImage,
          location: schema.agentProperties.location,
        })
        .from(schema.agentProperties)
        .where(and(eq(schema.agentProperties.organizationId, orgId), inArray(schema.agentProperties.id, propertyIds))),
    ])

    const seen = new Set<number>()
    for (const row of devRows) {
      seen.add(row.id)
      properties.push({
        ...row,
        resource: 'developer-properties',
        relations: [...(relationsByProperty.get(row.id) || [])].map((r) => RELATION_LABELS[r]),
      })
    }
    for (const row of agentRows) {
      // `visits.property_id` apunta a obra nueva, así que un id que también
      // exista en 2ª mano ya se ha resuelto arriba; no se duplica.
      if (seen.has(row.id)) continue
      properties.push({
        ...row,
        name: row.propertyType || 'Vivienda',
        resource: 'properties',
        relations: [...(relationsByProperty.get(row.id) || [])].map((r) => RELATION_LABELS[r]),
      })
    }
  }

  // --- Totales, todos derivados de filas reales ----------------------------
  const dealsVolume = deals.reduce((sum, d) => sum + (d.dealValue || 0), 0)
  const commission = deals.reduce((sum, d) => sum + (d.commissionAmount || 0), 0)

  const lastActivityAt = [
    ...visits.map((v) => v.scheduledAt),
    ...deals.map((d) => d.closedAt),
    ...leads.map((l) => l.lastContactAt || l.createdAt),
    ...contracts.map((c) => c.createdAt),
    ...activity.map((a) => a.createdAt),
    ...messages.map((m) => m.createdAt),
    ...calls.map((c) => c.startedAt || c.createdAt),
  ]
    .filter(Boolean)
    .sort()
    .pop() || null

  return {
    matchedBy: { name, email },
    leads,
    visits,
    deals,
    reservations,
    contracts,
    invoices,
    properties,
    activity,
    conversations,
    messages,
    calls,
    totals: {
      leads: leads.length,
      visits: visits.length,
      visitsCompleted: visits.filter((v) => v.status === 'completed').length,
      deals: deals.length,
      dealsVolume,
      commission,
      reservations: reservations.length,
      contracts: contracts.length,
      invoices: invoices.length,
      properties: properties.length,
      messages: messages.length,
      calls: calls.length,
      lastActivityAt,
    },
  }
})

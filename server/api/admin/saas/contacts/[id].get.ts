import { and, desc, eq, isNull } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { listBuyerRequirements, summarizeRequirement } from '../../../../utils/buyerRequirements/service'

/** Ficha de un contacto: sus datos, sus necesidades, y los leads/clientes que le pertenecen. */
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
    .select({ id: schema.leads.id, name: schema.leads.name, source: schema.leads.source, status: schema.leads.status, propertyName: schema.leads.propertyName, createdAt: schema.leads.createdAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, id)))
    .orderBy(desc(schema.leads.id))

  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, type: schema.clients.type, stage: schema.clients.stage })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.contactId, id)))

  return {
    contact,
    requirements: requirements.map((r) => ({ ...r, summary: summarizeRequirement(r) })),
    leads,
    clients,
  }
})

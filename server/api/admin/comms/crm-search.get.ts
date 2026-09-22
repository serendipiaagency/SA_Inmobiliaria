import { and, desc, eq, like, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { schema, useDb } from '../../../utils/db'

/** GET /api/admin/comms/crm-search?q= — clientes y leads de la organización para vincular un contacto desconocido. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { clients: [], leads: [] }
  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, phone: schema.clients.phone, email: schema.clients.email })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, orgId), or(like(schema.clients.name, pattern), like(schema.clients.phone, pattern), like(schema.clients.email, pattern))))
    .orderBy(desc(schema.clients.id))
    .limit(10)
  const leads = await db
    .select({ id: schema.leads.id, name: schema.leads.name, phone: schema.leads.phone, email: schema.leads.email, status: schema.leads.status })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), or(like(schema.leads.name, pattern), like(schema.leads.phone, pattern), like(schema.leads.email, pattern))))
    .orderBy(desc(schema.leads.id))
    .limit(10)
  return { clients, leads }
})

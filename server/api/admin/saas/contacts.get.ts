import { and, eq, isNull, sql } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'
import { searchContacts } from '../../../utils/contacts/service'

/** Lista/busca contactos del tenant. La búsqueda mira nombre, email y teléfono (searchContacts, compartida con la Domain Tool find_contacts). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const query = getQuery(event)
  const search = String(query.search || '').trim()
  const limit = Math.min(Number(query.limit) || 100, 200)

  const rows = await searchContacts(db, orgId, search, limit)

  // Cuántas necesidades tiene cada contacto, para la lista. Una sola consulta
  // agregada en vez de una por fila.
  const counts = await db
    .select({
      contactId: schema.buyerRequirements.contactId,
      total: sql<number>`count(*)`,
    })
    .from(schema.buyerRequirements)
    .where(and(eq(schema.buyerRequirements.organizationId, orgId), isNull(schema.buyerRequirements.deletedAt)))
    .groupBy(schema.buyerRequirements.contactId)

  const byContact = new Map(counts.map((c) => [c.contactId, Number(c.total)]))
  return rows.map((r) => ({ ...r, requirementsCount: byContact.get(r.id) || 0 }))
})

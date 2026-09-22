import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema } from '../../../utils/db'

/** Lista/busca contactos del tenant. La búsqueda mira nombre, email y teléfono. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const query = getQuery(event)
  const search = String(query.search || '').trim()
  const limit = Math.min(Number(query.limit) || 100, 200)

  const conditions = [eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)]
  if (search) {
    const pattern = `%${search.toLowerCase()}%`
    conditions.push(
      or(
        like(sql`lower(${schema.contacts.name})`, pattern),
        like(sql`lower(coalesce(${schema.contacts.email}, ''))`, pattern),
        like(sql`coalesce(${schema.contacts.phone}, '')`, `%${search}%`),
      )!,
    )
  }

  const rows = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      kind: schema.contacts.kind,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      whatsapp: schema.contacts.whatsapp,
      language: schema.contacts.language,
      assignedCommercialId: schema.contacts.assignedCommercialId,
      status: schema.contacts.status,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .where(and(...conditions))
    .orderBy(desc(schema.contacts.id))
    .limit(limit)

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

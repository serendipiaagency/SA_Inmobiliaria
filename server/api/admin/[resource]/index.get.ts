import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  const { def } = getResource(event)
  let orgId: number | null = null
  if (def.superAdminOnly) {
    await requireSuperAdmin(event)
  } else {
    orgId = (await requireOrgScope(event)).orgId
  }
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.perPage || '20'), 10) || 20))
  const q = String(query.q || '').trim()
  const trashed = String(query.trashed || '') === '1'

  const conds: any[] = []
  if (q && def.searchFields.length) conds.push(or(...def.searchFields.map((f) => like(def.table[f], `%${q}%`))))
  if (def.orgScoped !== false && orgId != null) conds.push(eq(def.table.organizationId, orgId))
  if (def.softDelete) conds.push(trashed ? sql`${def.table.deletedAt} is not null` : isNull(def.table.deletedAt))
  const where = conds.length ? and(...conds) : undefined

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(def.table)
    .where(where as any)
  const total = countRows[0]?.count ?? 0

  const rows = await db
    .select()
    .from(def.table)
    .where(where as any)
    .orderBy(desc(def.table.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return { rows, total, page, perPage }
})

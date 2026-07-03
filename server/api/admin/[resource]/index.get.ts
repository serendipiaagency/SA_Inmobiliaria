import { desc, like, or, sql } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { def } = getResource(event)
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.perPage || '20'), 10) || 20))
  const q = String(query.q || '').trim()

  const where =
    q && def.searchFields.length
      ? or(...def.searchFields.map((f) => like(def.table[f], `%${q}%`)))
      : undefined

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

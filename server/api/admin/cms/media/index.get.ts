import { and, desc, eq, like, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.perPage || '40'), 10) || 40))
  const q = String(query.q || '').trim()
  const type = String(query.type || '')

  const M = schema.cmsMedia
  const conds = [eq(M.organizationId, orgId)]
  if (q) conds.push(like(M.filename, `%${q}%`))
  if (type && type !== 'all') conds.push(eq(M.type, type))
  const where = and(...conds)

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(M).where(where)
  const total = countRows[0]?.count ?? 0

  const rows = await db.select().from(M).where(where).orderBy(desc(M.id)).limit(perPage).offset((page - 1) * perPage)
  return { rows, total, page, perPage }
})

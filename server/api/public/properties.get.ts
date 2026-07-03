import { and, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

/**
 * Off-plan project search.
 * Filters: q (name/community), community, status, minPrice, maxPrice, developerId.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(48, Math.max(1, parseInt(String(query.perPage || '12'), 10) || 12))

  const conds = []
  const q = String(query.q || '').trim()
  if (q) conds.push(like(schema.developerProperties.name, `%${q}%`))
  if (query.community) conds.push(like(schema.developerProperties.community, `%${String(query.community)}%`))
  if (query.status) conds.push(eq(schema.developerProperties.status, String(query.status)))
  if (query.developerId) conds.push(eq(schema.developerProperties.developerId, Number(query.developerId)))
  const minPrice = Number(query.minPrice)
  const maxPrice = Number(query.maxPrice)
  if (minPrice > 0) conds.push(gte(schema.developerProperties.price, minPrice))
  if (maxPrice > 0) conds.push(lte(schema.developerProperties.price, maxPrice))

  const where = conds.length ? and(...conds) : undefined

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.developerProperties)
    .where(where as any)
  const total = countRows[0]?.count ?? 0

  const rows = await db
    .select({
      project: schema.developerProperties,
      developerName: schema.developers.name,
    })
    .from(schema.developerProperties)
    .leftJoin(schema.developers, eq(schema.developerProperties.developerId, schema.developers.id))
    .where(where as any)
    .orderBy(desc(schema.developerProperties.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return {
    rows: rows.map((r) => ({ ...r.project, developerName: r.developerName })),
    total,
    page,
    perPage,
  }
})

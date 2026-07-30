import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireApiKey } from '../../utils/apiAuth'
import { rateLimit } from '../../utils/rateLimit'
import { attachPhotos } from '../../utils/photos'

/**
 * GET /api/v1/properties — documented on /admin/api since before this
 * existed (real gap found while building the Scheduler's public API:
 * the docs page listed 5 endpoints, none of which had ever been built).
 * Requires an API key with the "read" scope.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const P = schema.developerProperties
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(48, Math.max(1, parseInt(String(query.perPage || '20'), 10) || 20))

  const conds = [eq(P.organizationId, orgId)]
  if (query.community) conds.push(eq(P.community, String(query.community)))
  if (query.status) conds.push(eq(P.status, String(query.status)))
  const minPrice = Number(query.minPrice)
  const maxPrice = Number(query.maxPrice)
  if (minPrice > 0) conds.push(gte(P.price, minPrice))
  if (maxPrice > 0) conds.push(lte(P.price, maxPrice))

  const db = useDb(event)
  const rows = await db
    .select()
    .from(P)
    .where(and(...conds))
    .orderBy(desc(P.id))
    .limit(perPage)
    .offset((page - 1) * perPage)
  const data = await attachPhotos(db, rows)

  return { data, page, perPage }
})

import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireApiKey } from '../../../utils/apiAuth'
import { rateLimit } from '../../../utils/rateLimit'
import { attachPhotos } from '../../../utils/photos'

/**
 * GET /api/v1/properties/:id — documented on /admin/api alongside the list
 * endpoint but never implemented (same gap as communities/leads/agents).
 * Requires an API key with the "read" scope.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, id), eq(schema.developerProperties.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Property not found' })

  const [data] = await attachPhotos(db, rows)
  return { data }
})

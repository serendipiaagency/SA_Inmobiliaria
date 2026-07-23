import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { isValidChannelKey } from '../../../../utils/publication/channels'
import { ensureChannelConfigs } from '../../../../utils/publication/defaults'

/** Updates one channel's per-org config: enabled, window, priority, delays, retries, max time, dependencies. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const key = getRouterParam(event, 'key') || ''
  if (!isValidChannelKey(key)) throw createError({ statusCode: 404, statusMessage: 'Canal desconocido' })

  const db = useDb(event)
  await ensureChannelConfigs(db, orgId)

  const body = await readBody<Record<string, any>>(event)
  const patch: Record<string, any> = { updatedAt: now() }
  if (body?.enabled !== undefined) patch.enabled = body.enabled ? 1 : 0
  if (body?.windowStart !== undefined) patch.windowStart = body.windowStart || null
  if (body?.windowEnd !== undefined) patch.windowEnd = body.windowEnd || null
  if (body?.defaultPriority !== undefined) patch.defaultPriority = body.defaultPriority
  if (body?.defaultDelaySeconds !== undefined) patch.defaultDelaySeconds = Number(body.defaultDelaySeconds) || 0
  if (body?.maxRetries !== undefined) patch.maxRetries = Number(body.maxRetries) || 0
  if (body?.retryBackoffSeconds !== undefined) patch.retryBackoffSeconds = Number(body.retryBackoffSeconds) || 0
  if (body?.maxDurationSeconds !== undefined) patch.maxDurationSeconds = Number(body.maxDurationSeconds) || 0
  if (body?.dependsOnChannelKeys !== undefined) patch.dependsOnChannelKeys = JSON.stringify(body.dependsOnChannelKeys || [])

  await db
    .update(schema.publicationChannelConfigs)
    .set(patch)
    .where(and(eq(schema.publicationChannelConfigs.organizationId, orgId), eq(schema.publicationChannelConfigs.channelKey, key)))

  return { ok: true, key }
})

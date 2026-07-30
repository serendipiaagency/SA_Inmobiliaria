import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireApiKey } from '../../../utils/apiAuth'
import { rateLimit } from '../../../utils/rateLimit'
import { CHANNELS } from '../../../utils/publication/channels'
import { isChannelConnected } from '../../../utils/publication/adapters'

/** GET /api/v1/scheduler/channels — which channels are actually connected right now. Fase 16. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const db = useDb(event)
  const configs = await db.select().from(schema.publicationChannelConfigs).where(eq(schema.publicationChannelConfigs.organizationId, orgId))
  const byKey = Object.fromEntries(configs.map((c: any) => [c.channelKey, c]))
  const env = cfEnv(event) as any

  const data = CHANNELS.map((c) => ({ key: c.key, label: c.label, type: c.type, connected: isChannelConnected(c.key, env), enabled: byKey[c.key]?.enabled !== 0 }))
  return { data }
})

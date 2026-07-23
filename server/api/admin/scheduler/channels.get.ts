import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { CHANNELS } from '../../../utils/publication/channels'
import { ensureChannelConfigs } from '../../../utils/publication/defaults'
import { isChannelConnected } from '../../../utils/publication/adapters'

/** Every channel + this org's config + whether it's actually connected right now (real secret present). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  await ensureChannelConfigs(db, orgId)

  const configs = await db.select().from(schema.publicationChannelConfigs).where(eq(schema.publicationChannelConfigs.organizationId, orgId))
  const byKey = Object.fromEntries(configs.map((c: any) => [c.channelKey, c]))
  const env = cfEnv(event) as any

  const rows = CHANNELS.map((c) => ({
    ...c,
    connected: isChannelConnected(c.key, env),
    config: byKey[c.key] || null,
  }))

  return { rows }
})

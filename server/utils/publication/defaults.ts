import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { CHANNELS } from './channels'

/**
 * Every org sees all 19 channels from first load, each with sane defaults —
 * inserts the rows that don't exist yet rather than requiring a setup step.
 */
export async function ensureChannelConfigs(db: any, organizationId: number) {
  const existing = await db
    .select({ channelKey: schema.publicationChannelConfigs.channelKey })
    .from(schema.publicationChannelConfigs)
    .where(eq(schema.publicationChannelConfigs.organizationId, organizationId))
  const have = new Set(existing.map((r: any) => r.channelKey))
  const missing = CHANNELS.filter((c) => !have.has(c.key))
  if (!missing.length) return

  const nowTs = now()
  for (const c of missing) {
    await db.insert(schema.publicationChannelConfigs).values({
      organizationId,
      channelKey: c.key,
      enabled: 1,
      defaultPriority: 'normal',
      defaultDelaySeconds: 0,
      maxRetries: 3,
      retryBackoffSeconds: 300,
      maxDurationSeconds: 120,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
  }
}

export async function getChannelConfig(db: any, organizationId: number, channelKey: string) {
  const rows = await db
    .select()
    .from(schema.publicationChannelConfigs)
    .where(and(eq(schema.publicationChannelConfigs.organizationId, organizationId), eq(schema.publicationChannelConfigs.channelKey, channelKey)))
    .limit(1)
  return rows[0] || null
}

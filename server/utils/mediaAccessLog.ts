import type { H3Event } from 'h3'
import { schema, now } from './db'

export type MediaAccessAction = 'download' | 'denied'

/**
 * Records who looked at a private or confidential media object, and whether
 * they were actually allowed to. Best-effort by design (same contract as
 * `server/utils/audit.ts`): a logging failure must never block — or worse,
 * silently permit — an access decision that's already been made.
 *
 * `denied` rows matter as much as `download` ones. A burst of denials
 * against one tenant's KYC documents from a different tenant's session is
 * exactly the signal an incident investigation needs, and it only exists if
 * refusals are logged too, not just successes.
 */
export async function logMediaAccess(
  db: any,
  event: H3Event,
  params: {
    organizationId: number
    userId?: number | null
    userEmail?: string | null
    mediaAssetId?: number | null
    r2Key: string
    action: MediaAccessAction
    visibility?: string | null
  },
): Promise<void> {
  try {
    await db.insert(schema.mediaAccessLog).values({
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      mediaAssetId: params.mediaAssetId ?? null,
      r2Key: params.r2Key,
      action: params.action,
      visibility: params.visibility ?? null,
      ip: getRequestHeader(event, 'cf-connecting-ip') || getRequestIP(event) || null,
      userAgent: getRequestHeader(event, 'user-agent') || null,
      createdAt: now(),
    })
  } catch (err) {
    console.error('Failed to write media_access_log', err)
  }
}

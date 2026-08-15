import { and, eq, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { schema } from './db'

/**
 * Throws 413 if storing `additionalBytes` more would put the tenant over its
 * storage limit. Checked server-side, before the R2 write — a client-side
 * check is advisory at best and trivially bypassed by calling the API
 * directly, which is exactly the class of upload this project's other
 * endpoints (rate limiting, magic-byte validation) already refuse to trust
 * to the frontend.
 */
export async function assertQuotaAvailable(db: any, organizationId: number, additionalBytes: number): Promise<void> {
  const rows = await db
    .select({ used: schema.organizations.storageBytesUsed, limit: schema.organizations.storageBytesLimit })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1)
  const org = rows[0]
  if (!org) throw createError({ statusCode: 403, statusMessage: 'Organization not found' })
  if (org.used + additionalBytes > org.limit) {
    const usedMb = Math.round(org.used / 1024 / 1024)
    const limitMb = Math.round(org.limit / 1024 / 1024)
    throw createError({
      statusCode: 413,
      statusMessage: `Cuota de almacenamiento superada (${usedMb} MB de ${limitMb} MB usados). Elimina archivos o solicita más espacio.`,
    })
  }
}

/**
 * Recomputes `storage_bytes_used` from the real sum of non-deleted
 * media_assets rows for one organization. `registerMediaAsset` /
 * `softDeleteMediaAsset` keep the counter in step with each write, but this
 * is the backstop for the paths that can't be made fully atomic with R2 (a
 * `MEDIA.put()` that succeeds right before a D1 write fails, a row purged
 * outside the normal lifecycle, manual data fixes) — "reconciliable" rather
 * than "impossible to drift". Safe to run at any time; it only ever
 * overwrites the counter with a freshly computed truth.
 */
export async function reconcileStorageUsage(db: any, organizationId: number): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${schema.mediaAssets.sizeBytes}), 0)` })
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.organizationId, organizationId), isNull(schema.mediaAssets.deletedAt)))
  const total = rows[0]?.total ?? 0
  await db.update(schema.organizations).set({ storageBytesUsed: total }).where(eq(schema.organizations.id, organizationId))
  return total
}

/**
 * Real dependency checks for /api/health/ready — split out from the route
 * handler so each check is directly testable without the Workers runtime
 * (no defineEventHandler/cfEnv involved), same pattern as this session's
 * other server/utils/** extractions.
 */

export interface HealthCheckResult {
  ok: boolean
  error?: string
}

export async function checkDatabaseHealth(db: D1Database): Promise<HealthCheckResult> {
  try {
    await db.prepare('SELECT 1').first()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'D1 query failed' }
  }
}

export async function checkStorageHealth(bucket: R2Bucket): Promise<HealthCheckResult> {
  try {
    // head() on a key that doesn't exist returns null, not a throw — a
    // successful null response still proves R2 is reachable, which is all
    // this needs to confirm. No object needs to actually exist.
    await bucket.head('__health_check__')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'R2 call failed' }
  }
}

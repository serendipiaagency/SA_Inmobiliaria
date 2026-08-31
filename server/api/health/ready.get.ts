import { cfEnv } from '../../utils/db'
import { checkDatabaseHealth, checkStorageHealth } from '../../utils/health'

/**
 * Readiness — confirms the Worker's real dependencies (D1, R2) are
 * actually reachable, not just that the process is up. 503 when anything
 * is down, so an external monitor or the deploy pipeline's own smoke test
 * can tell "the app is up but degraded" apart from a plain 200. Public,
 * unauthenticated — same trust model as /api/health/live, no tenant or
 * business data is exposed, only ok/error per dependency.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const [database, storage] = await Promise.all([checkDatabaseHealth(env.DB), checkStorageHealth(env.MEDIA)])
  const ready = database.ok && storage.ok
  if (!ready) setResponseStatus(event, 503)
  return { status: ready ? 'ok' : 'degraded', checks: { database, storage }, timestamp: new Date().toISOString() }
})

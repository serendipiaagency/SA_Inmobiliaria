/**
 * Liveness — confirms the Worker itself is up and responding, no
 * dependency checks at all. Should fail only if the whole Worker is down,
 * never because D1 or R2 is having a bad day (that's /api/health/ready's
 * job) — a liveness probe that depends on external services is a common
 * cause of restart-loop false positives elsewhere, avoided here on
 * purpose. Public, unauthenticated, cheap enough to poll frequently.
 */
export default defineEventHandler(() => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

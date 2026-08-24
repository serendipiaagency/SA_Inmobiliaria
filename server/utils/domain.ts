/**
 * Hostname helpers for the domain-based tenant resolution in
 * server/middleware/00.tenant.ts. Kept dependency-free (no H3Event, no DB) so
 * they're trivial to unit test.
 */

/** Lowercase, strip a port suffix and a leading "www.". Same normalization is
 * applied to `organizations.domain` on write (adminResources.ts) so a lookup
 * is always a plain equality check. */
export function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
}

/**
 * Hosts that resolve to the platform's default tenant (organization 1)
 * without needing an `organizations.domain` row: the Cloudflare
 * `*.workers.dev` URL every environment gets for free (including staging),
 * localhost during development, and — once set — the platform's own
 * primary/marketing domain (`PRIMARY_DOMAIN`, an optional Worker var).
 *
 * `normalizedHost` must already be normalizeHost()'d.
 */
export function isPrimaryHost(normalizedHost: string, primaryDomain?: string | null): boolean {
  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') return true
  if (normalizedHost.endsWith('.workers.dev')) return true
  if (primaryDomain && normalizedHost === normalizeHost(primaryDomain)) return true
  return false
}

/**
 * Hosts an org may never claim as its own custom `domain` — assigning one of
 * these would let that org's admin silently hijack the default tenant's
 * traffic on every deploy preview / local dev / the platform's own domain.
 */
export function isReservedHost(normalizedHost: string): boolean {
  return normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost.endsWith('.workers.dev')
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function isValidHostname(normalizedHost: string): boolean {
  return HOSTNAME_RE.test(normalizedHost)
}

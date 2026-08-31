import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../utils/db'
import { normalizeHost, isPrimaryHost } from '../utils/domain'

/**
 * Domain-based tenant resolution — runs before everything else (filename
 * sorts first alphabetically) so `resolvePublicOrgId()` downstream can read
 * `event.context.org` instead of always assuming the default tenant.
 *
 * Resolution order for the incoming Host header:
 *  1. Matches an `organizations.domain` row exactly (after normalization) ->
 *     `event.context.org` is that organization. This is the only way a
 *     non-default tenant's public site/API/sitemap becomes reachable.
 *  2. Is a *primary* host (`*.workers.dev`, localhost, or the optional
 *     `PRIMARY_DOMAIN` var — see server/utils/domain.ts) -> nothing is set;
 *     `resolvePublicOrgId()` falls back to the default tenant (organization
 *     1), same as before any org ever had a domain configured.
 *  3. Anything else ("unknown domain") -> the request is refused with 404
 *     for the public surface. The admin panel, its API, and static assets
 *     stay reachable on ANY host (ADMIN_BYPASS_PREFIXES below) — a
 *     super_admin has to be able to log in and assign a domain to an org
 *     *before* that domain has ever been configured anywhere.
 *
 * Without step 3, an unrecognized host would previously fall through to the
 * default tenant's full public site (see git history) — harmless today only
 * because every request happens to be either localhost or *.workers.dev, but
 * it defeats the entire point of per-org domains once real custom domains
 * are in play: a stale DNS record, a domain removed from one org and not yet
 * reassigned, or simply a typo would silently leak the DEFAULT tenant's
 * catalog on a hostname nobody configured for it.
 */
// Despite the name, also covers /api/health — an external uptime monitor
// or Cloudflare's own health checks may hit the Worker by IP or a generic
// hostname never registered as a tenant domain, and must never get a 404
// from tenant resolution before ever reaching the actual health check.
const ADMIN_BYPASS_PREFIXES = ['/admin', '/api/admin', '/api/health', '/_nuxt', '/_ipx', '/cdn-cgi', '/favicon.ico']

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const host = normalizeHost(requestUrl.hostname)

  try {
    const db = useDb(event)
    const rows = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        companyName: schema.organizations.companyName,
        logo: schema.organizations.logo,
        brandColor: schema.organizations.brandColor,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.domain, host))
      .limit(1)
    if (rows[0]) {
      ;(event.context as any).org = rows[0]
      return
    }
  } catch {
    // Tenant resolution must never break the request — fall through to the default tenant.
    return
  }

  let primaryDomain: string | undefined
  try {
    primaryDomain = cfEnv(event).PRIMARY_DOMAIN
  } catch {
    // No Cloudflare bindings (shouldn't happen outside tests) — treat as unset.
  }
  if (isPrimaryHost(host, primaryDomain)) return

  if (ADMIN_BYPASS_PREFIXES.some((p) => requestUrl.pathname.startsWith(p))) return

  throw createError({ statusCode: 404, statusMessage: 'This domain is not configured for any site on this platform.' })
})

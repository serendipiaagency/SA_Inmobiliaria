import { eq } from 'drizzle-orm'
import { useDb, schema } from '../utils/db'

/**
 * Domain-based tenant resolution — runs before everything else (filename
 * sorts first alphabetically) so `resolvePublicOrgId()` downstream can read
 * `event.context.org` instead of always assuming the default tenant.
 *
 * Today no organization has a `domain` set (wrangler.toml has no custom
 * routes yet — every request hits the same hostname), so this always falls
 * through to the default tenant, identical to prior behavior. It only takes
 * effect once a client company is given its own domain pointed at this
 * Worker and that domain is saved on their `organizations` row.
 */
export default defineEventHandler(async (event) => {
  const host = getRequestURL(event).hostname
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
    }
  } catch {
    // Tenant resolution must never break the request — fall through to the default tenant.
  }
})

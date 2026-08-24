import { eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

/**
 * Public branding for the resolved tenant — consumed by useTenant() to
 * render Logo.vue, page <head>, and (via `isCustomDomain`) to decide
 * whether `/` should render the platform's own marketing page or this
 * tenant's real-estate portal home (pages/index.vue).
 *
 * `isCustomDomain` is true only when server/middleware/00.tenant.ts matched
 * this request's Host against a real `organizations.domain` row — never on
 * the primary/default host (*.workers.dev, localhost, PRIMARY_DOMAIN),
 * where event.context.org is deliberately left unset.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const isCustomDomain = Boolean((event.context as any).org)
  const orgId = resolvePublicOrgId(event)
  const rows = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      companyName: schema.organizations.companyName,
      logo: schema.organizations.logo,
      brandColor: schema.organizations.brandColor,
      // Data-controller identity for the public privacy/terms pages (task 12) —
      // nullable, so those pages show "por confirmar" until an org fills them in.
      legalCompanyName: schema.organizations.legalCompanyName,
      taxId: schema.organizations.taxId,
      legalAddress: schema.organizations.legalAddress,
      legalEmail: schema.organizations.legalEmail,
      legalPhone: schema.organizations.legalPhone,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  return {
    ...(rows[0] || {
      id: 1,
      name: 'M&M Real Estate',
      companyName: 'M&M Real Estate',
      logo: null,
      brandColor: null,
      legalCompanyName: null,
      taxId: null,
      legalAddress: null,
      legalEmail: null,
      legalPhone: null,
    }),
    isCustomDomain,
  }
})

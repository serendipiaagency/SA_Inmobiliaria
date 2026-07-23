import { eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

/** Public branding for the resolved tenant — consumed by useTenant() to render Logo.vue and page <head>. */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const rows = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, companyName: schema.organizations.companyName, logo: schema.organizations.logo, brandColor: schema.organizations.brandColor })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  return rows[0] || { id: 1, name: 'M&M Real Estate', companyName: 'M&M Real Estate', logo: null, brandColor: null }
})

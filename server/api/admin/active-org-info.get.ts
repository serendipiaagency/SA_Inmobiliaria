import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireOrgScope } from '../../utils/auth'

/** The logged-in admin's own (or currently switched-to, for super_admin) organization's branding. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, companyName: schema.organizations.companyName, logo: schema.organizations.logo, brandColor: schema.organizations.brandColor })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  return rows[0] || { id: orgId, name: 'M&M Real Estate', companyName: 'M&M Real Estate', logo: null, brandColor: null }
})

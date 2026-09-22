import { and, desc, eq, like, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { schema, useDb } from '../../../utils/db'

/** GET /api/admin/comms/properties?q= — el selector de propiedades del hilo (obra nueva publicada en la web, con su enlace público). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const q = String(getQuery(event).q || '').trim()
  const pattern = `%${q.replace(/[%_]/g, '')}%`
  const rows = await db
    .select({
      id: schema.developerProperties.id,
      name: schema.developerProperties.name,
      slug: schema.developerProperties.slug,
      price: schema.developerProperties.price,
      community: schema.developerProperties.community,
      coverImage: schema.developerProperties.coverImage,
      bedrooms: schema.developerProperties.bedrooms,
      propertyType: schema.developerProperties.propertyType,
    })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.organizationId, orgId), q ? or(like(schema.developerProperties.name, pattern), like(schema.developerProperties.community, pattern)) : undefined))
    .orderBy(desc(schema.developerProperties.id))
    .limit(20)
  return { rows }
})

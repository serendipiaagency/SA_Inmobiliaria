import { and, eq, inArray, like } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

  // Every lookup below is confined to the tenant that owns this hostname. The
  // community was previously fetched by bare id, so any tenant's community —
  // and, through the name match further down, its whole project catalog —
  // could be read from another tenant's public site.
  const rows = await db
    .select()
    .from(schema.communities)
    .where(and(eq(schema.communities.id, id), eq(schema.communities.organizationId, orgId)))
    .limit(1)
  const community = rows[0]
  if (!community) throw createError({ statusCode: 404, statusMessage: 'Community not found' })

  const links = await db
    .select()
    .from(schema.amenityCommunity)
    .where(eq(schema.amenityCommunity.communityId, id))
  const amenityIds = links.map((l) => l.amenityId)
  const communityAmenities = amenityIds.length
    ? await db
        .select()
        .from(schema.amenities)
        .where(and(inArray(schema.amenities.id, amenityIds), eq(schema.amenities.organizationId, orgId)))
    : []

  const projects = await db
    .select()
    .from(schema.developerProperties)
    .where(
      and(
        like(schema.developerProperties.community, `%${community.name}%`),
        eq(schema.developerProperties.organizationId, orgId),
      ),
    )

  return { community, amenities: communityAmenities, projects }
})

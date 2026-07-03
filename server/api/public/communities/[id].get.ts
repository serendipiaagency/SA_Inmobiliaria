import { eq, inArray, like } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const rows = await db.select().from(schema.communities).where(eq(schema.communities.id, id)).limit(1)
  const community = rows[0]
  if (!community) throw createError({ statusCode: 404, statusMessage: 'Community not found' })

  const links = await db
    .select()
    .from(schema.amenityCommunity)
    .where(eq(schema.amenityCommunity.communityId, id))
  const amenityIds = links.map((l) => l.amenityId)
  const communityAmenities = amenityIds.length
    ? await db.select().from(schema.amenities).where(inArray(schema.amenities.id, amenityIds))
    : []

  const projects = await db
    .select()
    .from(schema.developerProperties)
    .where(like(schema.developerProperties.community, `%${community.name}%`))

  return { community, amenities: communityAmenities, projects }
})

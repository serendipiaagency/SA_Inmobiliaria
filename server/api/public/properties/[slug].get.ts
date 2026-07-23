import { and, asc, eq, inArray } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)

  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event))))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const [developer, gallery, floorPlans, unitTypes, amenityLinks, locationLinks, socialMedia] = await Promise.all([
    db.select().from(schema.developers).where(eq(schema.developers.id, project.developerId)).limit(1),
    db.select().from(schema.images).where(eq(schema.images.developerPropertyId, project.id)),
    db.select().from(schema.floorPlans).where(eq(schema.floorPlans.developerPropertyId, project.id)),
    db.select().from(schema.propertyTypes).where(eq(schema.propertyTypes.developerPropertyId, project.id)),
    db
      .select()
      .from(schema.amenityDeveloperProperty)
      .where(eq(schema.amenityDeveloperProperty.developerPropertyId, project.id)),
    db
      .select()
      .from(schema.developerPropertyLocation)
      .where(eq(schema.developerPropertyLocation.developerPropertyId, project.id)),
    db
      .select()
      .from(schema.propertySocialMedia)
      .where(eq(schema.propertySocialMedia.developerPropertyId, project.id))
      .orderBy(asc(schema.propertySocialMedia.sortOrder)),
  ])

  const amenityIds = amenityLinks.map((a) => a.amenityId)
  const locationIds = locationLinks.map((l) => l.locationId)
  const [projectAmenities, projectLocations] = await Promise.all([
    amenityIds.length
      ? db.select().from(schema.amenities).where(inArray(schema.amenities.id, amenityIds))
      : Promise.resolve([]),
    locationIds.length
      ? db.select().from(schema.locations).where(inArray(schema.locations.id, locationIds))
      : Promise.resolve([]),
  ])

  const distances = Object.fromEntries(locationLinks.map((l) => [l.locationId, l.distance]))

  return {
    project,
    developer: developer[0] || null,
    gallery,
    floorPlans,
    unitTypes,
    amenities: projectAmenities,
    locations: projectLocations.map((l) => ({ ...l, distance: distances[l.id] ?? null })),
    socialMedia,
  }
})

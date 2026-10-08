import { and, asc, eq, inArray } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { toPublicProperty, toPublicSheet } from '../../../utils/propertyPrivacy'
import { livePropertyCond } from '../../../utils/properties/trash'
import { listPublicGallery, listPublicPropertyMedia } from '../../../utils/properties/media'
import { listPublicPropertyDocuments } from '../../../utils/properties/documents'
import { loadPropertySheet } from '../../../utils/properties/extendedSheet'
import { publicCustomFieldsFor } from '../../../utils/customFields/service'
import { PUBLIC_TEAM_COLUMNS } from '../../../utils/publicTeam'
import { listPublicFloorPlans } from '../../../utils/properties/floorPlans'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)

  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event)), livePropertyCond(schema.developerProperties)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Multimedia (FASE 7, bloque N7a): sólo fotos y recursos publicables, no
  // privados y no ocultos, en su orden; los documentos públicos sólo si la
  // propiedad está publicada; y de la ficha ampliada sólo los publicFields
  // del PropertySchemaRegistry (FASE 26).
  // «Atendido por»: el comercial responsable de la propiedad (`agent_id`, sin
  // FK), sólo si es de esta agencia, está activo y publicado en la web, y
  // sólo con sus columnas públicas (server/utils/publicTeam.ts). Si no, la
  // ficha enseña a la empresa.
  const agentQuery = project.agentId
    ? db
        .select(PUBLIC_TEAM_COLUMNS)
        .from(schema.teamMembers)
        .where(
          and(
            eq(schema.teamMembers.id, project.agentId),
            eq(schema.teamMembers.organizationId, project.organizationId),
            eq(schema.teamMembers.employmentStatus, 'active'),
            eq(schema.teamMembers.showOnWeb, 1),
          ),
        )
        .limit(1)
    : Promise.resolve([])
  const [developer, galleryByProperty, floorPlans, unitTypes, amenityLinks, locationLinks, socialMedia, media, documents, sheet, agentRows] = await Promise.all([
    db.select().from(schema.developers).where(eq(schema.developers.id, project.developerId)).limit(1),
    listPublicGallery(db, 'developer', [project.id]),
    // Planos (#110): sólo los visibles en la web, con imagen, en su orden y con sus columnas públicas.
    listPublicFloorPlans(db, project.id),
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
    listPublicPropertyMedia(db, project.organizationId, 'developer', project.id),
    listPublicPropertyDocuments(db, project.organizationId, 'developer', project.id),
    loadPropertySheet(db, project.organizationId, 'developer', project.id),
    agentQuery,
  ])
  const gallery = galleryByProperty.get(project.id) || []

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
  // Campos personalizados marcados «visible en la web pública» (FASE 0). Los
  // internos nunca salen de aquí: el filtro `isPublic` está en la consulta.
  const customFields = await publicCustomFieldsFor(db, project.organizationId, 'developer', project.id)

  return {
    project: toPublicProperty(project, { catalog: 'developer' }),
    developer: developer[0] || null,
    gallery,
    media,
    documents,
    details: toPublicSheet(sheet, 'developer', project.propertyType),
    floorPlans,
    unitTypes,
    amenities: projectAmenities,
    locations: projectLocations.map((l) => ({ ...l, distance: distances[l.id] ?? null })),
    socialMedia,
    customFields,
    agent: agentRows[0] || null,
  }
})

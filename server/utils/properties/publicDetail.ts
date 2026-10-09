import { and, asc, count, eq, inArray, ne } from 'drizzle-orm'
import { schema, type useDb } from '../db'
import { toPublicProperty, toPublicSheet } from '../propertyPrivacy'
import { livePropertyCond } from './trash'
import { listPublicGallery, listPublicPropertyMedia } from './media'
import { listPublicPropertyDocuments } from './documents'
import { loadPropertySheet } from './extendedSheet'
import { publicCustomFieldsFor } from '../customFields/service'
import { PUBLIC_TEAM_COLUMNS } from '../publicTeam'
import { listPublicFloorPlans } from './floorPlans'
import { getMarketStats } from '../market'
import { computeSerendipiaScore } from '../score'

/**
 * Lo que enseña la ficha pública de una propiedad, ya filtrado para el
 * público: lo usa la ficha (/api/public/properties/<slug>) y la vista del
 * Constructor Web (/api/admin/site-pages/ficha-sample), así lo que el
 * Constructor avisa que no saldrá es exactamente lo que la web oculta.
 * `project` es la fila de la propiedad, ya comprobada (de la empresa
 * correcta y fuera de la papelera) por quien llama.
 */
export async function loadPublicPropertyDetail(db: ReturnType<typeof useDb>, project: typeof schema.developerProperties.$inferSelect) {
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

  // Qué secciones de la ficha tienen datos de verdad (megaprompt «ficha»,
  // regla 8): la ficha oculta las que no, con su título y su entrada en la
  // barra de apartados, ya desde el HTML del servidor (sin parpadeos). Son las
  // mismas condiciones que usan sus componentes: Score con nota, dos o más
  // precios en el historial (el gráfico necesita dos) y otras propiedades
  // vivas de la agencia que puedan ser similares.
  const P = schema.developerProperties
  const [market, [historyRow], [othersRow]] = await Promise.all([
    getMarketStats(db, project),
    db.select({ n: count() }).from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, project.id)),
    db.select({ n: count() }).from(P).where(and(eq(P.organizationId, project.organizationId), ne(P.id, project.id), livePropertyCond(P))),
  ])
  const availability = {
    score: computeSerendipiaScore(project, market).overall != null,
    priceHistory: Number(historyRow?.n ?? 0) >= 2,
    similar: Number(othersRow?.n ?? 0) > 0,
  }

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
    availability,
  }
}

import { solarExposureFor } from '../solar/service'
import { estimateSolarExposureByOrientation } from '../../../utils/solarExposure'
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
import type { PropertyKind } from '../matching/service'

/**
 * La propiedad pública de una agencia por su slug, buscando en los DOS
 * catálogos de Property Core: primero obra nueva (developer_properties) y,
 * si no, 2ª mano (agent_properties). Devuelve la fila y de qué catálogo es, o
 * `null` (que quien llama traduce a 404). El slug es único por catálogo; una
 * colisión entre catálogos resuelve a obra nueva, la que ya existía.
 */
export async function findPublicPropertyBySlug(
  db: ReturnType<typeof useDb>,
  orgId: number,
  slug: string,
): Promise<{ project: any; kind: PropertyKind } | null> {
  const [dev] = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, orgId), livePropertyCond(schema.developerProperties)))
    .limit(1)
  if (dev) return { project: dev, kind: 'developer' }
  const [agentRow] = await db
    .select()
    .from(schema.agentProperties)
    .where(and(eq(schema.agentProperties.slug, slug), eq(schema.agentProperties.organizationId, orgId), livePropertyCond(schema.agentProperties)))
    .limit(1)
  if (agentRow) return { project: agentRow, kind: 'agent' }
  return null
}

/**
 * La referencia del anuncio que enseña la ficha pública («REF: …», junto a
 * las migas, y «Referencia del anuncio» en el bloque de fechas): la
 * referencia de agencia si la hay; si no, el código comercial de la ficha
 * ampliada; si no, la referencia propia que toda propiedad tiene. Todas las
 * propiedades enseñan una. Sólo sale esta etiqueta calculada: las columnas
 * `reference`, `agencyReference` y `externalReference` siguen sin publicarse
 * en `project` (propertyPrivacy.ts).
 */
export function publicReferenceLabel(project: { agencyReference?: string | null; reference?: string | null }, sheet: Record<string, unknown> | null | undefined): string {
  return String(project.agencyReference || sheet?.commercialCode || project.reference || '').trim()
}

/**
 * Lo que enseña la ficha pública de una propiedad, ya filtrado para el
 * público: lo usa la ficha (/api/public/properties/<slug>) y la vista del
 * Constructor Web (/api/admin/site-pages/ficha-sample), así lo que el
 * Constructor avisa que no saldrá es exactamente lo que la web oculta.
 * `project` es la fila de la propiedad, ya comprobada (de la empresa
 * correcta y fuera de la papelera) por quien llama.
 */
export async function loadPublicPropertyDetail(db: ReturnType<typeof useDb>, project: typeof schema.developerProperties.$inferSelect, kind: PropertyKind = 'developer') {
  const isDeveloper = kind === 'developer'
  // Multimedia (FASE 7, bloque N7a): sólo fotos y recursos publicables, no
  // privados y no ocultos, en su orden; los documentos públicos sólo si la
  // propiedad está publicada; y de la ficha ampliada sólo los publicFields
  // del PropertySchemaRegistry (FASE 26). La galería, los recursos, los
  // documentos y la ficha ampliada salen del catálogo de la propiedad (`kind`).
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
  // Las piezas sólo de obra nueva (promotor, tipologías, comodidades del
  // catálogo, ubicaciones del promotor, redes de la promoción, planos): en 2ª
  // mano no existen, y su sección se oculta sola («sección sin datos»).
  const [developer, galleryByProperty, floorPlans, unitTypes, amenityLinks, locationLinks, socialMedia, media, documents, sheet, agentRows] = await Promise.all([
    isDeveloper ? db.select().from(schema.developers).where(eq(schema.developers.id, project.developerId)).limit(1) : Promise.resolve([]),
    listPublicGallery(db, kind, [project.id]),
    // Planos (#110): sólo los visibles en la web, con imagen, en su orden y con sus columnas públicas.
    isDeveloper ? listPublicFloorPlans(db, project.id) : Promise.resolve([]),
    isDeveloper ? db.select().from(schema.propertyTypes).where(eq(schema.propertyTypes.developerPropertyId, project.id)) : Promise.resolve([]),
    isDeveloper ? db.select().from(schema.amenityDeveloperProperty).where(eq(schema.amenityDeveloperProperty.developerPropertyId, project.id)) : Promise.resolve([]),
    isDeveloper ? db.select().from(schema.developerPropertyLocation).where(eq(schema.developerPropertyLocation.developerPropertyId, project.id)) : Promise.resolve([]),
    isDeveloper
      ? db.select().from(schema.propertySocialMedia).where(eq(schema.propertySocialMedia.developerPropertyId, project.id)).orderBy(asc(schema.propertySocialMedia.sortOrder))
      : Promise.resolve([]),
    listPublicPropertyMedia(db, project.organizationId, kind, project.id),
    listPublicPropertyDocuments(db, project.organizationId, kind, project.id),
    loadPropertySheet(db, project.organizationId, kind, project.id),
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
  // barra de apartados, ya desde el HTML del servidor (sin parpadeos).
  //
  // El Serendipia Score, el «Análisis de inversión» y la «Evolución de precio»
  // son de obra nueva (viven en /score, /analysis y /price-history, que sólo
  // resuelven developer_properties): en 2ª mano se marcan como no disponibles,
  // así ni la sección ni su endpoint se activan. Las «Similares» (LazySimilarProperties)
  // también se piden sólo en obra nueva. El resto de la ficha (fotos, cabecera,
  // precio, descripción, características, mapa, exposición solar, orientación,
  // hipoteca, comercial y formulario) es igual en los dos catálogos.
  const P = schema.developerProperties
  const market = isDeveloper ? await getMarketStats(db, project) : { comparableCount: 0 }
  const othersCount = isDeveloper
    ? Number((await db.select({ n: count() }).from(P).where(and(eq(P.organizationId, project.organizationId), ne(P.id, project.id), livePropertyCond(P))))[0]?.n ?? 0)
    : 0
  const historyCount = isDeveloper
    ? Number((await db.select({ n: count() }).from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, project.id)))[0]?.n ?? 0)
    : 0
  // Exposición solar: primero un proveedor con licencia (sombras reales de edificios); si no hay,
  // una estimación propia por orientación y latitud (geometría solar real, cielo despejado), marcada como estimación.
  const solar =
    (await solarExposureFor({ organizationId: project.organizationId, lat: project.lat, lng: project.lng, locationPrivacy: project.locationPrivacy, orientation: project.orientation })) ??
    estimateSolarExposureByOrientation(project.lat, project.orientation)
  const availability = {
    solar: !!solar,
    score: isDeveloper && computeSerendipiaScore(project, market as any).overall != null,
    priceHistory: historyCount >= 2,
    similar: othersCount > 0,
    // «Análisis de inversión» compara con propiedades de la zona; sin
    // comparables no hay análisis, sólo un aviso, y un aviso no es información.
    analysis: Number((market as any).comparableCount ?? 0) > 0,
  }

  const distances = Object.fromEntries(locationLinks.map((l) => [l.locationId, l.distance]))
  // Campos personalizados marcados «visible en la web pública» (FASE 0). Los
  // internos nunca salen de aquí: el filtro `isPublic` está en la consulta.
  const customFields = await publicCustomFieldsFor(db, project.organizationId, kind, project.id)

  return {
    project: toPublicProperty(project, { catalog: kind }),
    catalog: kind,
    developer: developer[0] || null,
    gallery,
    media,
    documents,
    details: toPublicSheet(sheet, kind, project.propertyType),
    floorPlans,
    unitTypes,
    amenities: projectAmenities,
    locations: projectLocations.map((l) => ({ ...l, distance: distances[l.id] ?? null })),
    socialMedia,
    customFields,
    agent: agentRows[0] || null,
    availability,
    solar,
    referenceLabel: publicReferenceLabel(project, sheet),
  }
}

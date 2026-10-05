import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { buildTenantWhere } from '../../../utils/tenantPolicy'
import { buildPropertyFilterConds, parsePropertyFilters, DEVELOPER_PROPERTY_SORTS, PROPERTIES_SORTS, PROPERTY_EXPORT_MAX_ROWS, rowsToCsv } from '../../../utils/properties/searchService'
import { savedViewVisibilityCond } from '../../../utils/properties/savedViews'
import { livePropertyCond } from '../../../utils/properties/trash'
import { toolCatalogFor } from '../../../utils/tools/execute'
import { checkDomainAvailability } from '../../../utils/organizations/provisioning'
import { propertyDefaults } from '../../../utils/properties/summary'
import { squaredDistanceSql } from '../../../utils/properties/geoSearch'
import { propertyFilterOptions } from '../../../utils/properties/filterOptions'
import { customFieldValuesResourceGet, isCustomFieldValueResource } from '../../../utils/customFields/service'
import { isTagLinkResource, tagLinksResourceGet, withTags } from '../../../utils/tags/service'
import { haversineKm } from '../../../../utils/maps/geo'

/** Tope de puntos de la vista Mapa del listado de propiedades: más que eso se pide acercar el mapa o filtrar. */
const MAP_MAX_POINTS = 1000

const TEAM_SORTS: Record<string, any> = {
  newest: desc(schema.teamMembers.createdAt),
  oldest: asc(schema.teamMembers.createdAt),
  name_asc: asc(schema.teamMembers.name),
  name_desc: desc(schema.teamMembers.name),
}

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  // Catálogo de Domain Tools (FASE 31): sólo las herramientas que el RBAC de
  // este usuario permite, con su esquema de entrada. El resto de GET de
  // `domain-tools` es la traza y sigue el camino genérico (área system).
  if (key === 'domain-tools' && getQuery(event).view === 'catalog') {
    const { user } = await requireOrgScope(event)
    return { tools: toolCatalogFor(user) }
  }
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'read'))
  }
  const db = useDb(event)
  const query = getQuery(event)
  // Sistemas > Empresas: comprobación inmediata de un dominio en el asistente
  // de alta y en la ficha (?domainAvailable=…&excludeId=…). La autoridad
  // final sigue siendo el índice único al guardar.
  if (key === 'organizations' && typeof query.domainAvailable === 'string') {
    const excludeId = Number(query.excludeId)
    return checkDomainAvailability(db, query.domainAvailable, Number.isInteger(excludeId) && excludeId > 0 ? { excludeOrganizationId: excludeId } : {})
  }
  // Valores por defecto de una propiedad nueva (FASE 25, «defaults
  // inteligentes»): operación, privacidad, país y localidad habituales de la
  // agencia y el comercial vinculado a la cuenta, con su oficina y equipo.
  if ((key === 'properties' || key === 'developer-properties') && query.view === 'defaults') {
    return { defaults: await propertyDefaults(db, orgId!, user.id, key === 'properties' ? 'agent' : 'developer') }
  }
  // Campos personalizados y etiquetas de una ficha (FASE 0, bloque N7b): el
  // GET no es un listado de filas sino «lo de este registro» (o el catálogo),
  // con el registro comprobado contra la organización. Un recurso por área
  // (propiedades → Portal Web; contactos, leads, citas y operaciones → CRM).
  if (isCustomFieldValueResource(key)) return customFieldValuesResourceGet(db, orgId!, key, query)
  if (isTagLinkResource(key)) return tagLinksResourceGet(db, orgId!, key, query)
  // Opciones de los filtros del listado de propiedades (oficinas, comerciales,
  // etiquetas, campos personalizados, portales) en una sola llamada.
  if ((key === 'developer-properties' || key === 'properties') && query.view === 'filterOptions') {
    return propertyFilterOptions(db, orgId!, key === 'developer-properties' ? 'developer' : 'agent')
  }
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(String(query.perPage || '20'), 10) || 20))
  const q = String(query.q || '').trim()
  const trashed = String(query.trashed || '') === '1'

  const conds: any[] = []
  if (q && def.searchFields.length) {
    const idMatch = key === 'developer-properties' && /^\d+$/.test(q) ? eq(def.table.id, parseInt(q, 10)) : null
    conds.push(or(...def.searchFields.map((f) => like(def.table[f], `%${q}%`)), ...(idMatch ? [idMatch] : [])))
  }
  // Single source of truth for isolation — including child tables, which are
  // filtered by an EXISTS on their parent rather than listed platform-wide.
  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  if (tenantWhere) conds.push(tenantWhere)
  if (def.softDelete) conds.push(trashed ? sql`${def.table.deletedAt} is not null` : isNull(def.table.deletedAt))
  // Filtros exactos que el recurso declara (notas de un contacto, propietarios
  // de una propiedad…). Nunca una columna que no esté en `filterFields`.
  for (const f of def.filterFields || []) {
    const v = query[f]
    if (v === undefined || v === null || v === '') continue
    conds.push(eq(def.table[f], /^\d+$/.test(String(v)) ? Number(v) : String(v)))
  }

  // "Propiedades (web)" y "Propiedades 2ª mano" admin listing — price/
  // location/type/status/beds/baths/area/exclusividad/publicación/fechas de
  // captación y actualización, y sorting real que el listado genérico nunca
  // necesitó para ningún otro recurso. Kept as branches here (rather than
  // sibling literal routes under server/api/admin/developer-properties/ o
  // server/api/admin/properties/) because Nitro can't cleanly mix a literal
  // path segment with the `[resource]` dynamic one at the same depth — a
  // literal index.get.ts there broke this exact endpoint's POST/PUT/DELETE
  // fallback for every other resource type.
  //
  // El propio filtro (qué columna, qué operador) vive una sola vez en
  // `properties/searchService.ts` (FASE 27 §51 "UNA SOLA BÚSQUEDA") —
  // parametrizado por `kind`, no duplicado por catálogo como antes.
  const isDeveloperProperties = key === 'developer-properties'
  const isProperties = key === 'properties'
  const propertyFilters = isDeveloperProperties || isProperties ? parsePropertyFilters(query) : null
  if (propertyFilters) {
    conds.push(...buildPropertyFilterConds(isDeveloperProperties ? 'developer' : 'agent', propertyFilters))
    // Bulk Actions (FASE 28 incremento 2) — "exportar seleccionadas" reutiliza
    // este mismo endpoint con un filtro por ids, no un mecanismo nuevo (ver
    // docs/bulk-actions.md). Sólo se activa si `ids` llega — el resto de
    // listados/exportaciones no lo usan y siguen exactamente igual.
    if (typeof query.ids === 'string' && query.ids.trim()) {
      const idList = query.ids
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      if (idList.length) conds.push(inArray(def.table.id, idList))
    }
  }

  // "Comerciales" admin listing — status/office/department/zone/
  // specialization/language filters and an assigned-properties count the
  // plain generic listing never needed. Same reasoning as the
  // developer-properties branch above for living here instead of a sibling
  // literal route.
  const isTeam = key === 'team'
  // Las propiedades en la papelera no cuentan como «asignadas» a nadie.
  const liveDev = livePropertyCond(schema.developerProperties)
  const liveAgent = livePropertyCond(schema.agentProperties)
  if (isTeam) {
    const t = schema.teamMembers
    if (query.employmentStatus) conds.push(eq(t.employmentStatus, String(query.employmentStatus)))
    if (query.officeName) conds.push(like(t.officeName, `%${query.officeName}%`))
    if (query.department) conds.push(like(t.department, `%${query.department}%`))
    if (query.position) conds.push(like(t.position, `%${query.position}%`))
    if (query.zone) conds.push(like(t.zones, `%${query.zone}%`))
    if (query.specialty) conds.push(like(t.specialties, `%${query.specialty}%`))
    if (query.language) conds.push(like(t.languages, `%${query.language}%`))
    if (query.assignedProperties === 'with') {
      conds.push(sql`(
        exists(select 1 from developer_properties where developer_properties.agent_id = ${t.id} and ${liveDev})
        or exists(select 1 from agent_properties where agent_properties.agent_id = ${t.id} and ${liveAgent})
      )`)
    } else if (query.assignedProperties === 'without') {
      conds.push(sql`not (
        exists(select 1 from developer_properties where developer_properties.agent_id = ${t.id} and ${liveDev})
        or exists(select 1 from agent_properties where agent_properties.agent_id = ${t.id} and ${liveAgent})
      )`)
    }
  }

  // Filtros/vistas guardadas de Property Search (FASE 27 incremento 2):
  // cada quien ve las suyas más las que alguien compartió con toda la
  // organización — nunca las privadas de otro. Misma razón que los branches
  // de arriba para vivir aquí en vez de en una ruta propia.
  const isPropertySavedViews = key === 'property-saved-views'
  if (isPropertySavedViews) {
    conds.push(savedViewVisibilityCond(user.id))
    // Un filtro guardado para "Propiedades (web)" no tiene sentido ofrecerlo
    // en el selector de "Propiedades 2ª mano" — sus columnas/valores son de
    // otro catálogo. El cliente siempre manda `resource`; sin él (llamada
    // directa) se listan los de los dos, que es el comportamiento anterior.
    if (query.resource) conds.push(eq(schema.propertySavedViews.resource, String(query.resource)))
  }

  const where = conds.length ? and(...conds) : undefined

  // Vista Mapa del listado de propiedades (FASE 2): los puntos de TODO el
  // resultado filtrado (no sólo la página), con tope, y sólo los que tienen
  // coordenadas válidas. Mismas condiciones que el listado: lo que sale en el
  // mapa es exactamente lo que se puede paginar.
  if ((isDeveloperProperties || isProperties) && query.view === 'map') {
    const t = (isDeveloperProperties ? schema.developerProperties : schema.agentProperties) as any
    const withCoords = and(where as any, sql`${t.lat} is not null and ${t.lng} is not null and not (${t.lat} = 0 and ${t.lng} = 0)`)
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(t).where(withCoords)
    const points = await db
      .select({
        id: t.id,
        lat: t.lat,
        lng: t.lng,
        price: t.price,
        status: t.status,
        propertyType: t.propertyType,
        reference: t.reference,
        city: t.city,
        district: t.district,
        ...(isDeveloperProperties ? { name: t.name, coverImage: t.coverImage, community: t.community } : { mainImage: t.mainImage, transactionType: t.transactionType }),
      })
      .from(t)
      .where(withCoords)
      .orderBy(desc(t.id))
      .limit(MAP_MAX_POINTS)
    return { points, total: Number(n) || 0, capped: Number(n) > MAP_MAX_POINTS, maxPoints: MAP_MAX_POINTS }
  }

  // Export CSV (§79) — mismas condiciones y las mismas columnas ya
  // autorizadas que el listado JSON de abajo, así que nunca puede exponer
  // un dato que el usuario no pudiera ya ver paginando (no hay precio
  // mínimo, comisión ni dato de propietario en ninguna de las dos tablas
  // hoy — nada que excluir a propósito porque no existe el campo). Sin
  // paginar, con tope (PROPERTY_EXPORT_MAX_ROWS) en vez de página a página.
  const wantsCsv = String(query.format || '') === 'csv'
  if (isDeveloperProperties && wantsCsv) {
    const t = schema.developerProperties
    const sort = DEVELOPER_PROPERTY_SORTS[String(query.sort || 'newest')] || DEVELOPER_PROPERTY_SORTS.newest
    const rows = await db
      .select({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        price: t.price,
        propertyType: t.propertyType,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
        area: t.area,
        community: t.community,
        city: t.city,
        country: t.country,
        isExclusive: t.isExclusive,
        publishedAt: t.publishedAt,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(PROPERTY_EXPORT_MAX_ROWS)
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${key}.csv"`)
    return rowsToCsv(rows)
  }
  if (isProperties && wantsCsv) {
    const t = schema.agentProperties
    const sort = PROPERTIES_SORTS[String(query.sort || 'newest')] || PROPERTIES_SORTS.newest
    const rows = await db
      .select({
        id: t.id,
        reference: t.reference,
        slug: t.slug,
        propertyType: t.propertyType,
        transactionType: t.transactionType,
        status: t.status,
        price: t.price,
        area: t.area,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
        city: t.city,
        district: t.district,
        country: t.country,
        isExclusive: t.isExclusive,
        publishedAt: t.publishedAt,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(PROPERTY_EXPORT_MAX_ROWS)
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${key}.csv"`)
    return rowsToCsv(rows)
  }

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(def.table)
    .where(where as any)
  const total = countRows[0]?.count ?? 0

  // Orden por cercanía (FASE 2): sólo con una búsqueda por radio, que es la que tiene centro.
  const radius = propertyFilters?.geo?.radius
  const byDistance = String(query.sort || '') === 'distance' && radius
  /** Etiquetas de cada fila y, con radio, su distancia real al centro (km). */
  async function decorateProperties(kind: 'agent' | 'developer', rows: any[]) {
    const tagged = await withTags(db, orgId!, kind, rows)
    if (!radius) return tagged
    return tagged.map((r: any) => ({
      ...r,
      distanceKm: typeof r.lat === 'number' && typeof r.lng === 'number' ? Math.round(haversineKm(radius, { lat: r.lat, lng: r.lng }) * 100) / 100 : null,
    }))
  }

  if (isDeveloperProperties) {
    const t = schema.developerProperties
    const sort = byDistance ? asc(squaredDistanceSql(t.lat, t.lng, radius)) : DEVELOPER_PROPERTY_SORTS[String(query.sort || 'newest')] || DEVELOPER_PROPERTY_SORTS.newest
    const rows = await db
      .select({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        price: t.price,
        priceOld: t.priceOld,
        propertyType: t.propertyType,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
        area: t.area,
        coverImage: t.coverImage,
        community: t.community,
        city: t.city,
        country: t.country,
        agentId: t.agentId,
        isExclusive: t.isExclusive,
        isReserved: t.isReserved,
        publishedAt: t.publishedAt,
        updatedAt: t.updatedAt,
        // La vista Papelera enseña cuándo se borró.
        deletedAt: t.deletedAt,
        developerId: t.developerId,
        developerName: schema.developers.name,
        transactionType: t.transactionType,
        reference: t.reference,
        lat: t.lat,
        lng: t.lng,
      })
      .from(t)
      .leftJoin(schema.developers, eq(t.developerId, schema.developers.id))
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows: await decorateProperties('developer', rows), total, page, perPage }
  }

  if (isProperties) {
    const t = schema.agentProperties
    const sort = byDistance ? asc(squaredDistanceSql(t.lat, t.lng, radius)) : PROPERTIES_SORTS[String(query.sort || 'newest')] || PROPERTIES_SORTS.newest
    const rows = await db
      .select({
        id: t.id,
        slug: t.slug,
        location: t.location,
        city: t.city,
        country: t.country,
        district: t.district,
        propertyType: t.propertyType,
        transactionType: t.transactionType,
        status: t.status,
        price: t.price,
        area: t.area,
        bedrooms: t.bedrooms,
        bathrooms: t.bathrooms,
        mainImage: t.mainImage,
        agentId: t.agentId,
        isExclusive: t.isExclusive,
        publishedAt: t.publishedAt,
        updatedAt: t.updatedAt,
        deletedAt: t.deletedAt,
        reference: t.reference,
        lat: t.lat,
        lng: t.lng,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows: await decorateProperties('agent', rows), total, page, perPage }
  }

  if (isTeam) {
    const t = schema.teamMembers
    const sort = TEAM_SORTS[String(query.sort || 'name_asc')] || TEAM_SORTS.name_asc
    const rows = await db
      .select({
        id: t.id,
        name: t.name,
        slug: t.slug,
        position: t.position,
        email: t.email,
        phone: t.phone,
        image: t.image,
        department: t.department,
        officeName: t.officeName,
        specialties: t.specialties,
        languages: t.languages,
        zones: t.zones,
        employmentStatus: t.employmentStatus,
        showOnWeb: t.showOnWeb,
        updatedAt: t.updatedAt,
        assignedPropertiesCount: sql<number>`(
          (select count(*) from developer_properties where developer_properties.agent_id = ${t.id} and ${liveDev})
          + (select count(*) from agent_properties where agent_properties.agent_id = ${t.id} and ${liveAgent})
        )`,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows, total, page, perPage }
  }

  // Las notas fijadas van primero; el resto, de la más reciente a la más antigua.
  const order =
    key === 'notes'
      ? [desc(schema.notes.isPinned), desc(def.table.id)]
      : key === 'custom-fields'
        ? // Campos personalizados: en el orden en que salen en las fichas.
          [asc(schema.customFieldDefinitions.entityType), asc(schema.customFieldDefinitions.sortOrder), asc(def.table.id)]
        : [desc(def.table.id)]
  let rows = await db
    .select()
    .from(def.table)
    .where(where as any)
    .orderBy(...order)
    .limit(perPage)
    .offset((page - 1) * perPage)
  if (def.decorateRows && orgId != null) rows = await def.decorateRows(db, orgId, rows)

  return { rows, total, page, perPage }
})

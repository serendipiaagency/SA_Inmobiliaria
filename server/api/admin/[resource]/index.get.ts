import { and, asc, desc, eq, gte, isNull, like, lte, or, sql } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { buildTenantWhere } from '../../../utils/tenantPolicy'

const DEVELOPER_PROPERTY_SORTS: Record<string, any> = {
  newest: desc(schema.developerProperties.createdAt),
  oldest: asc(schema.developerProperties.createdAt),
  price_desc: desc(schema.developerProperties.price),
  price_asc: asc(schema.developerProperties.price),
  name_asc: asc(schema.developerProperties.name),
  name_desc: desc(schema.developerProperties.name),
}

const PROPERTIES_SORTS: Record<string, any> = {
  newest: desc(schema.agentProperties.createdAt),
  oldest: asc(schema.agentProperties.createdAt),
  price_desc: desc(schema.agentProperties.price),
  price_asc: asc(schema.agentProperties.price),
}

const TEAM_SORTS: Record<string, any> = {
  newest: desc(schema.teamMembers.createdAt),
  oldest: asc(schema.teamMembers.createdAt),
  name_asc: asc(schema.teamMembers.name),
  name_desc: desc(schema.teamMembers.name),
}

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  if (def.superAdminOnly) {
    await requireSuperAdmin(event)
  } else {
    orgId = (await requireOrgScope(event)).orgId
  }
  const db = useDb(event)
  const query = getQuery(event)
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

  // "Propiedades (web)" admin listing — price/location/type/status/beds/
  // baths/area filters and real sorting the plain generic listing never
  // needed for any other resource. Kept as a branch here (rather than a
  // sibling literal route under server/api/admin/developer-properties/)
  // because Nitro can't cleanly mix a literal path segment with the `[resource]`
  // dynamic one at the same depth — a literal index.get.ts there broke this
  // exact endpoint's POST/PUT/DELETE fallback for every other resource type.
  const isDeveloperProperties = key === 'developer-properties'
  if (isDeveloperProperties) {
    const t = schema.developerProperties
    if (query.priceMin) conds.push(gte(t.price, Number(query.priceMin)))
    if (query.priceMax) conds.push(lte(t.price, Number(query.priceMax)))
    if (query.country) conds.push(like(t.country, `%${query.country}%`))
    if (query.city) conds.push(like(t.city, `%${query.city}%`))
    if (query.district) conds.push(like(t.district, `%${query.district}%`))
    if (query.postalCode) conds.push(like(t.postalCode, `%${query.postalCode}%`))
    if (query.propertyType) conds.push(eq(t.propertyType, String(query.propertyType)))
    if (query.status) conds.push(eq(t.status, String(query.status)))
    if (query.bedroomsMin) conds.push(gte(t.bedrooms, Number(query.bedroomsMin)))
    if (query.bathroomsMin) conds.push(gte(t.bathrooms, Number(query.bathroomsMin)))
    if (query.areaMin) conds.push(gte(t.area, Number(query.areaMin)))
    if (query.areaMax) conds.push(lte(t.area, Number(query.areaMax)))
  }

  // "Propiedades 2ª mano" admin listing — same filter set as
  // developer-properties above, kept as its own branch (rather than merged
  // into it) since it's a distinct table with a distinct column set.
  const isProperties = key === 'properties'
  if (isProperties) {
    const t = schema.agentProperties
    if (query.priceMin) conds.push(gte(t.price, Number(query.priceMin)))
    if (query.priceMax) conds.push(lte(t.price, Number(query.priceMax)))
    if (query.country) conds.push(like(t.country, `%${query.country}%`))
    if (query.city) conds.push(like(t.city, `%${query.city}%`))
    if (query.district) conds.push(like(t.district, `%${query.district}%`))
    if (query.postalCode) conds.push(like(t.postalCode, `%${query.postalCode}%`))
    if (query.propertyType) conds.push(eq(t.propertyType, String(query.propertyType)))
    if (query.transactionType) conds.push(eq(t.transactionType, String(query.transactionType)))
    if (query.status) conds.push(eq(t.status, String(query.status)))
    if (query.bedroomsMin) conds.push(gte(t.bedrooms, Number(query.bedroomsMin)))
    if (query.bathroomsMin) conds.push(gte(t.bathrooms, Number(query.bathroomsMin)))
    if (query.areaMin) conds.push(gte(t.area, Number(query.areaMin)))
    if (query.areaMax) conds.push(lte(t.area, Number(query.areaMax)))
  }

  // "Comerciales" admin listing — status/office/department/zone/
  // specialization/language filters and an assigned-properties count the
  // plain generic listing never needed. Same reasoning as the
  // developer-properties branch above for living here instead of a sibling
  // literal route.
  const isTeam = key === 'team'
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
        exists(select 1 from developer_properties where developer_properties.agent_id = ${t.id})
        or exists(select 1 from agent_properties where agent_properties.agent_id = ${t.id})
      )`)
    } else if (query.assignedProperties === 'without') {
      conds.push(sql`not (
        exists(select 1 from developer_properties where developer_properties.agent_id = ${t.id})
        or exists(select 1 from agent_properties where agent_properties.agent_id = ${t.id})
      )`)
    }
  }

  const where = conds.length ? and(...conds) : undefined

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(def.table)
    .where(where as any)
  const total = countRows[0]?.count ?? 0

  if (isDeveloperProperties) {
    const t = schema.developerProperties
    const sort = DEVELOPER_PROPERTY_SORTS[String(query.sort || 'newest')] || DEVELOPER_PROPERTY_SORTS.newest
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
        developerId: t.developerId,
        developerName: schema.developers.name,
      })
      .from(t)
      .leftJoin(schema.developers, eq(t.developerId, schema.developers.id))
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows, total, page, perPage }
  }

  if (isProperties) {
    const t = schema.agentProperties
    const sort = PROPERTIES_SORTS[String(query.sort || 'newest')] || PROPERTIES_SORTS.newest
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
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows, total, page, perPage }
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
          (select count(*) from developer_properties where developer_properties.agent_id = ${t.id})
          + (select count(*) from agent_properties where agent_properties.agent_id = ${t.id})
        )`,
      })
      .from(t)
      .where(where as any)
      .orderBy(sort)
      .limit(perPage)
      .offset((page - 1) * perPage)
    return { rows, total, page, perPage }
  }

  const rows = await db
    .select()
    .from(def.table)
    .where(where as any)
    .orderBy(desc(def.table.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return { rows, total, page, perPage }
})

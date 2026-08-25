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

  const rows = await db
    .select()
    .from(def.table)
    .where(where as any)
    .orderBy(desc(def.table.id))
    .limit(perPage)
    .offset((page - 1) * perPage)

  return { rows, total, page, perPage }
})

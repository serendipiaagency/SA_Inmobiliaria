import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'

const P = schema.developerProperties

const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/**
 * Off-plan project search with advanced filters + live count.
 *
 * Filters: q, community, street, postalCode, status, developerId, minPrice, maxPrice,
 *   minArea, maxArea, bedrooms (min), bathrooms (min), type, new, orientation, minYear,
 *   energy (max letter), and boolean features: elevator, pool, garage, terrace, garden,
 *   pets, accessible.
 * Params: sort (price_asc|price_desc|newest), page, perPage, countOnly.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const perPage = Math.min(48, Math.max(1, parseInt(String(query.perPage || '12'), 10) || 12))
  const countOnly = String(query.countOnly || '') === '1'

  const conds = []
  const q = String(query.q || '').trim()
  if (q)
    conds.push(
      or(
        like(P.name, `%${q}%`),
        like(P.community, `%${q}%`),
        like(P.street, `%${q}%`),
        like(P.postalCode, `%${q}%`),
        like(P.slug, `%${q}%`),
      ),
    )
  if (query.community) conds.push(like(P.community, `%${String(query.community)}%`))
  if (query.street) conds.push(like(P.street, `%${String(query.street)}%`))
  if (query.postalCode) conds.push(like(P.postalCode, `%${String(query.postalCode)}%`))
  if (query.status) conds.push(eq(P.status, String(query.status)))
  if (String(query.new || '') === '1') conds.push(eq(P.status, 'new'))
  if (query.developerId) conds.push(eq(P.developerId, Number(query.developerId)))
  if (query.type) conds.push(eq(P.propertyType, String(query.type)))
  if (query.orientation) conds.push(eq(P.orientation, String(query.orientation)))

  // Fetch by exact ids (favorites/compare) — bypasses the normal page size
  // cap so a saved item never silently disappears once the catalog grows
  // past the default 48-item page.
  const idList = String(query.ids || '')
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 200)
  if (idList.length) conds.push(inArray(P.id, idList))

  const minPrice = Number(query.minPrice)
  const maxPrice = Number(query.maxPrice)
  if (minPrice > 0) conds.push(gte(P.price, minPrice))
  if (maxPrice > 0) conds.push(lte(P.price, maxPrice))

  const minArea = Number(query.minArea)
  const maxArea = Number(query.maxArea)
  if (minArea > 0) conds.push(gte(P.area, minArea))
  if (maxArea > 0) conds.push(lte(P.area, maxArea))

  const bedrooms = Number(query.bedrooms)
  const bathrooms = Number(query.bathrooms)
  if (bedrooms > 0) conds.push(gte(P.bedrooms, bedrooms))
  if (bathrooms > 0) conds.push(gte(P.bathrooms, bathrooms))

  const minYear = Number(query.minYear)
  if (minYear > 0) conds.push(gte(P.yearBuilt, minYear))

  // Energy: "energy=B" means B or better (A, B)
  const energy = String(query.energy || '').toUpperCase()
  if (ENERGY_ORDER.includes(energy)) {
    const allowed = ENERGY_ORDER.slice(0, ENERGY_ORDER.indexOf(energy) + 1)
    conds.push(sql`${P.energyRating} in (${sql.join(allowed.map((a) => sql`${a}`), sql`, `)})`)
  }

  const bools: [string, any][] = [
    ['elevator', P.hasElevator],
    ['pool', P.hasPool],
    ['garage', P.hasGarage],
    ['terrace', P.hasTerrace],
    ['garden', P.hasGarden],
    ['pets', P.petsAllowed],
    ['accessible', P.accessible],
  ]
  for (const [key, col] of bools) {
    if (String(query[key] || '') === '1') conds.push(eq(col, 1))
  }

  const where = conds.length ? and(...conds) : undefined

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(P).where(where as any)
  const total = countRows[0]?.count ?? 0

  if (countOnly) return { total }

  const sortKey = String(query.sort || '')
  const orderBy =
    sortKey === 'price_asc'
      ? asc(P.price)
      : sortKey === 'price_desc'
        ? desc(P.price)
        : desc(P.id)

  const baseQuery = db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    .where(where as any)
    .orderBy(orderBy)
  const rows = idList.length ? await baseQuery : await baseQuery.limit(perPage).offset((page - 1) * perPage)

  const merged = rows.map((r) => ({ ...r.project, developerName: r.developerName }))
  const withPhotos = await attachPhotos(db, merged)

  return { rows: withPhotos, total, page, perPage }
})

import { and, desc, eq, gt, like, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'

const P = schema.developerProperties

/**
 * Public, CORS-enabled feed for embeddable widgets. No auth. Returns a compact
 * project list filtered by a preset and optional city, with photos attached.
 *
 * Query: filter (all|featured|latest|luxury|promo|new), city, limit (1-24).
 */
export default defineEventHandler(async (event) => {
  // CORS — the widget iframe is same-origin, but expose the JSON feed for
  // developers who prefer to consume it directly from another host.
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300',
  })
  if (event.method === 'OPTIONS') return ''

  const db = useDb(event)
  const q = getQuery(event)
  const filter = String(q.filter || 'all')
  const city = String(q.city || '').trim()
  const limit = Math.min(24, Math.max(1, parseInt(String(q.limit || '6'), 10) || 6))

  const conds: any[] = []
  if (city) conds.push(like(P.community, `%${city}%`))
  if (filter === 'featured') conds.push(eq(P.isExclusive, 1))
  if (filter === 'new') conds.push(eq(P.status, 'new'))
  if (filter === 'promo') conds.push(and(sql`${P.priceOld} is not null`, gt(P.priceOld, P.price)))

  let order: any = desc(P.publishedAt)
  if (filter === 'luxury') order = desc(P.price)
  if (filter === 'latest') order = desc(P.createdAt)

  const rows = await db
    .select({
      id: P.id,
      slug: P.slug,
      name: P.name,
      community: P.community,
      price: P.price,
      priceOld: P.priceOld,
      coverImage: P.coverImage,
      bedrooms: P.bedrooms,
      bathrooms: P.bathrooms,
      area: P.area,
      status: P.status,
      isExclusive: P.isExclusive,
      rentalYield: P.rentalYield,
      lat: P.lat,
      lng: P.lng,
    })
    .from(P)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(order)
    .limit(limit)

  const withPhotos = await attachPhotos(db, rows, 4)
  return { filter, city, count: withPhotos.length, rows: withPhotos }
})

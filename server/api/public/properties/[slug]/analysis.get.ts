import { and, eq, ne } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { analyzeInvestment, type MarketStats } from '../../../../utils/ai'

/**
 * Investment analysis for a single property. Kept as its own lazy-loaded
 * endpoint (like /api/public/ask) so an optional LLM call never blocks the
 * main property page load.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const P = schema.developerProperties
  const rows = await db.select().from(P).where(eq(P.slug, slug)).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const comparables = project.community
    ? await db
        .select({ price: P.price, area: P.area, rentalYield: P.rentalYield })
        .from(P)
        .where(and(eq(P.community, project.community), ne(P.id, project.id)))
    : []

  const pricesPerM2 = comparables.map((c) => (c.price && c.area ? c.price / c.area : null)).filter((v): v is number => v != null)
  const yields = comparables.map((c) => c.rentalYield).filter((v): v is number => v != null)

  const market: MarketStats = {
    comparableCount: comparables.length,
    avgPricePerM2: pricesPerM2.length ? pricesPerM2.reduce((a, b) => a + b, 0) / pricesPerM2.length : null,
    avgRentalYield: yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : null,
  }

  const { text, engine } = await analyzeInvestment(event, project, market)
  return { text, engine, market }
})

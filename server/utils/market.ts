import { and, eq, ne } from 'drizzle-orm'
import { schema } from './db'
import { livePropertyCond } from './properties/trash'

export interface MarketStats {
  comparableCount: number
  avgPricePerM2: number | null
  avgRentalYield: number | null
}

/**
 * Real comparable stats for a property's own community — never fabricated.
 * Comparables only from the SAME agency: another tenant's prices are not this
 * tenant's market data to publish (two agencies can share a community name).
 */
export async function getMarketStats(db: any, project: { id: number; organizationId: number; community: string | null }): Promise<MarketStats> {
  const P = schema.developerProperties
  const comparables = project.community
    ? await db
        .select({ price: P.price, area: P.area, rentalYield: P.rentalYield })
        .from(P)
        // Comparables: sólo propiedades vivas (una de la papelera no es mercado).
        .where(and(eq(P.organizationId, project.organizationId), eq(P.community, project.community), ne(P.id, project.id), livePropertyCond(P)))
    : []

  const pricesPerM2 = comparables.map((c: any) => (c.price && c.area ? c.price / c.area : null)).filter((v: any): v is number => v != null)
  const yields = comparables.map((c: any) => c.rentalYield).filter((v: any): v is number => v != null)

  return {
    comparableCount: comparables.length,
    avgPricePerM2: pricesPerM2.length ? pricesPerM2.reduce((a: number, b: number) => a + b, 0) / pricesPerM2.length : null,
    avgRentalYield: yields.length ? yields.reduce((a: number, b: number) => a + b, 0) / yields.length : null,
  }
}

import { and, eq, isNotNull } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

interface ValuationBody {
  propertyType?: string
  community?: string
  area?: number
  bedrooms?: number
}

/**
 * Real, transparent estimate — never a black box. Pulls actual listings from
 * this tenant's own catalog as comparables (same community, same property
 * type when given, area within ±30%), averages their real price/m², and
 * returns exactly which comparables were used so the number can be
 * verified rather than trusted blindly. If there aren't enough comparables,
 * this says so honestly instead of inventing a confident-looking figure.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<ValuationBody>(event)

  const area = Number(body.area)
  if (!Number.isFinite(area) || area <= 0) throw createError({ statusCode: 422, statusMessage: 'La superficie debe ser un número positivo' })

  const db = useDb(event)
  const conds = [eq(schema.developerProperties.organizationId, orgId), isNotNull(schema.developerProperties.price), isNotNull(schema.developerProperties.area)]
  if (body.community?.trim()) conds.push(eq(schema.developerProperties.community, body.community.trim()))
  if (body.propertyType?.trim()) conds.push(eq(schema.developerProperties.propertyType, body.propertyType.trim()))

  const candidates = await db
    .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, price: schema.developerProperties.price, area: schema.developerProperties.area, community: schema.developerProperties.community })
    .from(schema.developerProperties)
    .where(and(...conds))

  const comparables = candidates.filter((c) => c.area! >= area * 0.7 && c.area! <= area * 1.3).map((c) => ({ id: c.id, name: c.name, price: c.price!, area: c.area!, pricePerSqm: Math.round(c.price! / c.area!) }))

  let estimatedAvg: number | null = null
  let estimatedLow: number | null = null
  let estimatedHigh: number | null = null
  let pricePerSqmAvg: number | null = null

  if (comparables.length > 0) {
    const perSqm = comparables.map((c) => c.pricePerSqm)
    pricePerSqmAvg = Math.round(perSqm.reduce((a, b) => a + b, 0) / perSqm.length)
    const perSqmMin = Math.min(...perSqm)
    const perSqmMax = Math.max(...perSqm)
    estimatedAvg = Math.round(pricePerSqmAvg * area)
    estimatedLow = Math.round(perSqmMin * area)
    estimatedHigh = Math.round(perSqmMax * area)
  }

  const nowTs = now()
  const [row] = await db
    .insert(schema.valuations)
    .values({
      organizationId: orgId,
      propertyType: body.propertyType || null,
      community: body.community || null,
      area,
      bedrooms: body.bedrooms || null,
      estimatedLow,
      estimatedAvg,
      estimatedHigh,
      pricePerSqmAvg,
      comparablesJson: JSON.stringify(comparables),
      requestedBy: user.id,
      createdAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'run', resource: 'valuation', resourceId: row.id })
  return { ...row, comparables }
})

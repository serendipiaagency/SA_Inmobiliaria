import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { analyzeInvestment } from '../../../../utils/ai'
import { getMarketStats } from '../../../../utils/market'
import { livePropertyCond } from '../../../../utils/properties/trash'
import { organizationCurrency } from '../../../../utils/currency'

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
  // Slug lookups on the public site must be confined to the tenant that owns
  // this hostname. Without the organization filter, any tenant's project could
  // be read from any other tenant's public site just by knowing its slug.
  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const rows = await db.select().from(P).where(and(eq(P.slug, slug), eq(P.organizationId, resolvePublicOrgId(event)), livePropertyCond(P))).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const market = await getMarketStats(db, project)
  // Los importes del análisis, en la moneda de la agencia (utils/currency.ts).
  const { text, engine } = await analyzeInvestment(event, project, market, await organizationCurrency(db, project.organizationId))
  return { text, engine, market }
})

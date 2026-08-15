import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { getMarketStats } from '../../../../utils/market'
import { computeSerendipiaScore, computeDecisionScores } from '../../../../utils/score'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event))))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const market = await getMarketStats(db, project)
  const serendipia = computeSerendipiaScore(project, market)
  return { ...serendipia, decision: computeDecisionScores(project, market) }
})

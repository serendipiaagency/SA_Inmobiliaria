import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db.select({ id: schema.developerProperties.id }).from(schema.developerProperties).where(eq(schema.developerProperties.slug, slug)).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const history = await db
    .select({ price: schema.priceHistory.price, recordedAt: schema.priceHistory.recordedAt })
    .from(schema.priceHistory)
    .where(eq(schema.priceHistory.developerPropertyId, project.id))

  history.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  return { history }
})

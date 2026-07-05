import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db
    .select({ id: schema.developerProperties.id, viewCount: schema.developerProperties.viewCount, favoriteCount: schema.developerProperties.favoriteCount })
    .from(schema.developerProperties)
    .where(eq(schema.developerProperties.slug, slug))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const leadRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.leads)
    .where(eq(schema.leads.propertyId, project.id))

  return {
    viewCount: project.viewCount,
    favoriteCount: project.favoriteCount,
    leadCount: leadRows[0]?.count || 0,
  }
})

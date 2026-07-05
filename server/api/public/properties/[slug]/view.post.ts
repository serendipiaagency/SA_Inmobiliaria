import { eq, sql } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db.select({ id: schema.developerProperties.id }).from(schema.developerProperties).where(eq(schema.developerProperties.slug, slug)).limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  await db
    .update(schema.developerProperties)
    .set({ viewCount: sql`${schema.developerProperties.viewCount} + 1` })
    .where(eq(schema.developerProperties.id, project.id))
  await db.insert(schema.propertyViews).values({ developerPropertyId: project.id, createdAt: now() })
  return { ok: true }
})

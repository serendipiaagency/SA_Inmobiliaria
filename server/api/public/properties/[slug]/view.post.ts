import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  await db
    .update(schema.developerProperties)
    .set({ viewCount: sql`${schema.developerProperties.viewCount} + 1` })
    .where(eq(schema.developerProperties.slug, slug))
  return { ok: true }
})

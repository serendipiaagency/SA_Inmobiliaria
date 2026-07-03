import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const rows = await db.select().from(schema.blogs).where(eq(schema.blogs.slug, slug)).limit(1)
  const blog = rows[0]
  if (!blog) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })
  const translations = await db
    .select()
    .from(schema.blogTranslations)
    .where(eq(schema.blogTranslations.blogId, blog.id))
  return { blog, translations }
})

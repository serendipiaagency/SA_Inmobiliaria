import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const rows = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.slug, slug)).limit(1)
  const member = rows[0]
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Team member not found' })
  return { member }
})

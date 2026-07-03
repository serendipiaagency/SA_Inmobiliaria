import { desc } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db.select().from(schema.teamMembers).orderBy(desc(schema.teamMembers.id))
  return { rows }
})

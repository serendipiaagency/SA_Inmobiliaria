import { desc } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db.select().from(schema.locations).orderBy(desc(schema.locations.id))
  return { rows }
})

import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: number; on?: boolean }>(event)
  const id = Number(body?.id)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const db = useDb(event)
  const delta = body?.on ? 1 : -1
  await db
    .update(schema.developerProperties)
    .set({ favoriteCount: sql`max(0, ${schema.developerProperties.favoriteCount} + ${delta})` })
    .where(eq(schema.developerProperties.id, id))
  return { ok: true }
})

import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: number; on?: boolean }>(event)
  const id = Number(body?.id)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const db = useDb(event)
  const delta = body?.on ? 1 : -1
  await db
    .update(schema.developerProperties)
    .set({ favoriteCount: sql`max(0, ${schema.developerProperties.favoriteCount} + ${delta})` })
    // Scoped to this hostname's tenant: without it, anyone could drive the
    // favourite counter of another agency's listing by posting its id.
    .where(and(eq(schema.developerProperties.id, id), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event))))
  return { ok: true }
})

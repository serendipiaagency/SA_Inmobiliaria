import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const { key, def } = getResource(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (key === 'users' && id === user.id) {
    throw createError({ statusCode: 422, statusMessage: 'You cannot delete your own account' })
  }
  const db = useDb(event)
  await db.delete(def.table).where(eq(def.table.id, id))
  return { ok: true }
})

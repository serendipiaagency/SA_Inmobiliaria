import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { def } = getResource(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const rows = await db.select().from(def.table).where(eq(def.table.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let translations: any[] = []
  if (def.translations) {
    const { table, foreignKey } = def.translations
    translations = await db.select().from(table).where(eq(table[foreignKey], id))
  }
  return { row, translations }
})

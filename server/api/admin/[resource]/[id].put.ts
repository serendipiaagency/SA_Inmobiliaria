import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { def } = getResource(event)
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, false)
  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(eq(def.table.id, id))
  }
  await syncTranslations(db, def, id, body?.translations)
  return { ok: true, id }
})

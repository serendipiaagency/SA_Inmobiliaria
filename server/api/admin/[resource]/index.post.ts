import { useDb } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { def } = getResource(event)
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, true)
  const inserted = await db.insert(def.table).values(data).returning({ id: def.table.id })
  const id = inserted[0]?.id
  await syncTranslations(db, def, id, body?.translations)
  return { ok: true, id }
})

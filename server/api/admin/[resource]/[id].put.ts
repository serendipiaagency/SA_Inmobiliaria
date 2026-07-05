import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { key, def } = getResource(event)
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, false)

  // Off-plan project prices are chartable on the public property page — every
  // real edit here becomes a real data point, never a fabricated one.
  if (key === 'developer-properties' && typeof data.price === 'number') {
    const current = await db.select({ price: schema.developerProperties.price }).from(schema.developerProperties).where(eq(schema.developerProperties.id, id)).limit(1)
    if (current[0] && current[0].price !== data.price) {
      await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, recordedAt: new Date().toISOString() })
    }
  }

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(eq(def.table.id, id))
  }
  await syncTranslations(db, def, id, body?.translations)
  return { ok: true, id }
})

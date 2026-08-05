import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'

/** Public, unauthenticated unsubscribe link (same token-as-credential pattern as /q/[code] and /citas/[token]) — a real update, not a fake confirmation page. */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDb(event)
  const row = (await db.select().from(schema.savedSearches).where(eq(schema.savedSearches.unsubscribeToken, token)).limit(1))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await db.update(schema.savedSearches).set({ active: 0 }).where(eq(schema.savedSearches.id, row.id))

  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Búsqueda cancelada</title></head><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222"><h1>Listo</h1><p>Ya no recibirás más avisos de esta búsqueda guardada.</p></body></html>`
})

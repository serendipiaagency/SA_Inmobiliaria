import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { rateLimit } from '../../../../utils/rateLimit'

/**
 * Client-initiated confirmation via their own management link (FASE 17,
 * migración 0072). Idempotente: confirmar una cita ya confirmada no es un
 * error, sólo no hace nada — el cliente puede volver a la página sin que eso
 * cuente como un segundo evento.
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'appointment-manage', { limit: 30, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const db = useDb(event)
  const rows = await db.select().from(schema.visits).where(eq(schema.visits.managementToken, token)).limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })
  if (visit.status !== 'scheduled') throw createError({ statusCode: 422, statusMessage: 'Esta cita ya no está activa' })

  if (visit.confirmationStatus !== 'confirmed') {
    await db.update(schema.visits).set({ confirmationStatus: 'confirmed', confirmedAt: now() }).where(eq(schema.visits.id, visit.id))
  }

  return { ok: true }
})

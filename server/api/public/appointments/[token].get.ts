import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { rateLimit } from '../../../utils/rateLimit'

/** Self-service lookup: GET /api/public/appointments/:token — the management token itself is the auth, no session needed. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'appointment-manage', { limit: 30, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.visits.id,
      clientName: schema.visits.clientName,
      propertyName: schema.visits.propertyName,
      agentId: schema.visits.agentId,
      agentName: schema.visits.agentName,
      agentSlug: schema.teamMembers.slug,
      scheduledAt: schema.visits.scheduledAt,
      endsAt: schema.visits.endsAt,
      status: schema.visits.status,
      channel: schema.visits.channel,
      videoLink: schema.visits.videoLink,
      confirmationStatus: schema.visits.confirmationStatus,
      tourId: schema.visits.tourId,
      tourStopOrder: schema.visits.tourStopOrder,
    })
    .from(schema.visits)
    .leftJoin(schema.teamMembers, eq(schema.teamMembers.id, schema.visits.agentId))
    .where(eq(schema.visits.managementToken, token))
    .limit(1)

  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada' })

  // FASE 18: si esta parada pertenece a un tour, se enseñan las demás — de
  // sólo lectura, para que el cliente vea el resto de su itinerario. Cada
  // parada se sigue gestionando (cancelar/reprogramar/confirmar) sólo con su
  // propio enlace, nunca desde aquí.
  let tourStops: Array<{ propertyName: string | null; scheduledAt: string; status: string; tourStopOrder: number | null }> = []
  if (visit.tourId != null) {
    const siblings = await db
      .select({ propertyName: schema.visits.propertyName, scheduledAt: schema.visits.scheduledAt, status: schema.visits.status, tourStopOrder: schema.visits.tourStopOrder })
      .from(schema.visits)
      .where(eq(schema.visits.tourId, visit.tourId))
    tourStops = siblings.sort((a: any, b: any) => (a.tourStopOrder ?? 0) - (b.tourStopOrder ?? 0))
  }

  return { visit, tourStops }
})

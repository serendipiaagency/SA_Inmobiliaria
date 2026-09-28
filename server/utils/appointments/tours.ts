import { eq, and, isNotNull } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { hasOverlappingVisit, shiftDateTime } from './availability'
import { generateManagementToken } from './managementToken'

/**
 * Tours (FASE 18, migración 0073): un cliente viendo varios inmuebles en una
 * misma salida. Cada parada es una fila real de `visits` — la hora, el
 * comercial, el estado y la confirmación del cliente de cada parada viven
 * ahí (FASE 17), nunca duplicados aquí. `createTour()` sólo orquesta crear
 * la cabecera y sus paradas, con la misma comprobación de solapes que ya usa
 * el resto de la agenda.
 */

export interface TourStopInput {
  /** developer_properties.id — mismo alcance que el resto del sistema de citas (visits.propertyId nunca referencia agent_properties). */
  propertyId?: number | null
  agentId: number
  /** 'YYYY-MM-DD HH:MM:SS' */
  scheduledAt: string
  channel?: 'in_person' | 'video' | 'phone'
}

export interface CreateTourInput {
  clientName: string
  clientEmail?: string | null
  clientPhone?: string | null
  leadId?: number | null
  notes?: string | null
  stops: TourStopInput[]
}

export interface TourStopView {
  id: number
  propertyId: number | null
  propertyName: string | null
  agentId: number
  agentName: string
  scheduledAt: string
  endsAt: string
  status: string
  channel: string
  confirmationStatus: string
  tourStopOrder: number
  managementToken: string
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Crea un tour y todas sus paradas. Resuelve y valida cada parada primero
 * (comercial real, inmueble real si lo hay, solape contra la agenda
 * existente y entre las propias paradas del tour) para poder señalar cuál
 * falla; las paradas ya validadas se insertan juntas en un único
 * `db.batch()` — o entran todas, o no entra ninguna, así que un tour nunca
 * se queda a medias por un fallo a mitad de la creación.
 */
export async function createTour(db: any, orgId: number, input: CreateTourInput): Promise<{ id: number; stopIds: number[] }> {
  if (!input.stops.length) throw createError({ statusCode: 422, statusMessage: 'Un tour necesita al menos una parada' })

  const nowTs = now()
  const resolved: Array<TourStopInput & { agentName: string; propertyName: string | null; durationMinutes: number; endsAt: string }> = []

  for (const [index, stop] of input.stops.entries()) {
    const label = `Parada ${index + 1}`
    if (!DATETIME_RE.test(stop.scheduledAt)) throw createError({ statusCode: 422, statusMessage: `${label}: fecha y hora no válidas (YYYY-MM-DD HH:MM:SS)` })

    const agentRows = await db
      .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.id, stop.agentId), eq(schema.teamMembers.organizationId, orgId)))
      .limit(1)
    const agent = agentRows[0]
    if (!agent) throw createError({ statusCode: 404, statusMessage: `${label}: comercial no encontrado` })

    let propertyName: string | null = null
    if (stop.propertyId) {
      const propRows = await db
        .select({ name: schema.developerProperties.name })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, stop.propertyId), eq(schema.developerProperties.organizationId, orgId)))
        .limit(1)
      propertyName = propRows[0]?.name ?? null
    }

    const endsAt = shiftDateTime(stop.scheduledAt, agent.slotDurationMinutes)

    const clashesWithEarlierStop = resolved.some((r) => r.agentId === stop.agentId && overlaps(stop.scheduledAt, endsAt, r.scheduledAt, r.endsAt))
    if (clashesWithEarlierStop) throw createError({ statusCode: 422, statusMessage: `${label}: se solapa con otra parada de este mismo tour para ${agent.name}` })

    if (await hasOverlappingVisit(db, orgId, stop.agentId, stop.scheduledAt, endsAt)) {
      throw createError({ statusCode: 409, statusMessage: `${label}: ${agent.name} ya tiene otra cita a esa hora` })
    }

    resolved.push({ ...stop, agentName: agent.name, propertyName, durationMinutes: agent.slotDurationMinutes, endsAt })
  }

  const [tour] = await db
    .insert(schema.propertyTours)
    .values({
      organizationId: orgId,
      clientName: input.clientName,
      clientEmail: input.clientEmail || null,
      clientPhone: input.clientPhone || null,
      leadId: input.leadId || null,
      notes: input.notes || null,
      createdAt: nowTs,
    })
    .returning({ id: schema.propertyTours.id })

  try {
    const results = await db.batch(
      resolved.map((stop, index) =>
        db
          .insert(schema.visits)
          .values({
            organizationId: orgId,
            clientName: input.clientName,
            propertyId: stop.propertyId || null,
            propertyName: stop.propertyName,
            agentId: stop.agentId,
            agentName: stop.agentName,
            scheduledAt: stop.scheduledAt,
            durationMinutes: stop.durationMinutes,
            endsAt: stop.endsAt,
            status: 'scheduled',
            channel: stop.channel || 'in_person',
            type: 'property_viewing',
            clientEmail: input.clientEmail || null,
            clientPhone: input.clientPhone || null,
            leadId: input.leadId || null,
            tourId: tour.id,
            tourStopOrder: index,
            managementToken: generateManagementToken(),
            createdAt: nowTs,
          })
          .returning({ id: schema.visits.id }),
      ),
    )
    return { id: tour.id, stopIds: results.map((r: any) => r[0].id) }
  } catch (e: any) {
    // db.batch() es atómico: si una parada choca con otra reserva que ganó la
    // carrera justo ahora, no entra ninguna — pero la cabecera del tour ya se
    // insertó antes del batch y se queda huérfana (sin paradas). Es un rastro
    // inofensivo, no un tour a medias: sin filas en visits.tour_id, no
    // aparece en ningún listado que muestre "tour con sus paradas".
    if (String(e?.cause?.message || e?.message || '').includes('UNIQUE constraint failed')) {
      throw createError({ statusCode: 409, statusMessage: 'Una de las paradas ya no está disponible, vuelve a intentarlo.' })
    }
    throw e
  }
}

/** Tours de la organización con sus paradas, más recientes primero. */
export async function listTours(db: any, orgId: number): Promise<Array<{ id: number; clientName: string; clientEmail: string | null; clientPhone: string | null; notes: string | null; createdAt: string; stops: TourStopView[] }>> {
  const tours = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.organizationId, orgId)).orderBy(schema.propertyTours.createdAt)
  if (!tours.length) return []

  const stopRows = await db.select().from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), isNotNull(schema.visits.tourId)))
  const stopsByTour = new Map<number, TourStopView[]>()
  for (const v of stopRows as any[]) {
    const list = stopsByTour.get(v.tourId) || []
    list.push({
      id: v.id,
      propertyId: v.propertyId,
      propertyName: v.propertyName,
      agentId: v.agentId,
      agentName: v.agentName,
      scheduledAt: v.scheduledAt,
      endsAt: v.endsAt,
      status: v.status,
      channel: v.channel,
      confirmationStatus: v.confirmationStatus,
      tourStopOrder: v.tourStopOrder ?? 0,
      managementToken: v.managementToken,
    })
    stopsByTour.set(v.tourId, list)
  }

  return (tours as any[])
    .map((t) => ({
      id: t.id,
      clientName: t.clientName,
      clientEmail: t.clientEmail,
      clientPhone: t.clientPhone,
      notes: t.notes,
      createdAt: t.createdAt,
      stops: (stopsByTour.get(t.id) || []).sort((a, b) => a.tourStopOrder - b.tourStopOrder),
    }))
    .reverse()
}

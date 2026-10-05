import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { hasOverlappingVisit } from './availability'
import { generateManagementToken } from './managementToken'
import { generateVideoLink } from './videoLink'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import { propertyState, trashedPropertyMessage } from '../properties/trash'
import { markFirstAppointment } from '../leads/sla'
import { notifyAppointment } from './notifications'
import type { PropertyKind } from '../matching/service'
import { resolveLeadAndContact } from './adminCreate'
import { fail, initialReminderStatus, loadAgent, loadLead, minutesBetween, normalizeDateTime, optionalId, optionalText, parsePropertyKind, parseTimezone, propertyDisplayName, resolveChannel, resolveEnd } from './fields'
import { attachRelatedOffers, type RelatedOffer } from './query'
import { selectInChunks } from '../sqlChunks'
import { DEFAULT_TOUR_GAP_MINUTES, MAX_TOUR_GAP_MINUTES, planSequentialSchedule } from '../../../utils/tourPlanning'

/**
 * Tours (FASE 18, migración 0073): un cliente viendo varios inmuebles en una
 * misma salida. Cada parada es una fila real de `visits` — la hora, el
 * comercial, el estado, la confirmación y el resultado de cada parada viven
 * ahí (FASE 17), nunca duplicados aquí. Este módulo orquesta crear la
 * cabecera con sus paradas, editar la cabecera (cliente, lead, contacto y
 * notas) y reordenar la ruta recalculando las horas, siempre con la misma
 * comprobación de solapes que el resto de la agenda.
 *
 * Cada parada tiene su propia hora y su propia duración (o fin), y su
 * inmueble puede ser de cualquiera de los dos catálogos — por eso se guarda
 * `propertyKind` en cada parada: sin él no se podía ofertar ni filtrar.
 */

export interface TourStopInput {
  propertyId?: number | null
  /** 'agent' (2ª mano) o 'developer' (obra nueva). Sin él, obra nueva (compatibilidad con los tours anteriores). */
  propertyKind?: PropertyKind | null
  agentId: number
  /** 'YYYY-MM-DD HH:MM:SS' */
  scheduledAt: string
  /** Fin propio de la parada; alternativa a `durationMinutes`. Sin ninguno, la franja del comercial. */
  endsAt?: string | null
  durationMinutes?: number | null
  channel?: 'in_person' | 'video' | 'phone'
  meetingPoint?: string | null
}

export interface CreateTourInput {
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  leadId?: number | null
  contactId?: number | null
  notes?: string | null
  timezone?: string | null
  stops: TourStopInput[]
  createdBy?: number | null
}

export interface TourStopView {
  id: number
  propertyId: number | null
  propertyKind: string | null
  propertyName: string | null
  agentId: number
  agentName: string
  scheduledAt: string
  endsAt: string
  durationMinutes: number
  status: string
  channel: string
  confirmationStatus: string
  cancellationReason: string | null
  meetingPoint: string | null
  tourStopOrder: number
  managementToken: string
  leadId: number | null
  contactId: number | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  outcome: string | null
  outcomeNotes: string | null
  interestLevel: number | null
  outcomeLiked: string | null
  outcomeDisliked: string | null
  pricePerception: string | null
  locationRating: number | null
  conditionRating: number | null
  layoutRating: number | null
  wantsSecondVisit: number | null
  wantsToOffer: number | null
  discarded: number | null
  offers: RelatedOffer[]
}

export interface TourView {
  id: number
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  leadId: number | null
  leadName: string | null
  contactId: number | null
  contactName: string | null
  notes: string | null
  createdAt: string
  stops: TourStopView[]
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * Crea un tour y todas sus paradas. Resuelve y valida cada parada primero
 * (comercial real, inmueble real de su catálogo y fuera de la papelera, su
 * propia duración, solape contra la agenda existente y entre las propias
 * paradas del tour) para poder señalar cuál falla; las paradas ya validadas
 * se insertan juntas en un único `db.batch()` — o entran todas, o no entra
 * ninguna, así que un tour nunca se queda a medias.
 */
export async function createTour(db: any, orgId: number, input: CreateTourInput): Promise<{ id: number; stopIds: number[] }> {
  if (!input.stops?.length) throw createError({ statusCode: 422, statusMessage: 'Un tour necesita al menos una parada' })
  const { lead, contact } = await resolveLeadAndContact(db, orgId, input.leadId, input.contactId)
  const clientName = String(input.clientName || '').trim() || contact?.name || lead?.name || ''
  if (!clientName) fail(422, 'El nombre del cliente es obligatorio (clientName)')
  const clientEmail = String(input.clientEmail || '').trim() || contact?.email || lead?.email || null
  const clientPhone = String(input.clientPhone || '').trim() || contact?.phone || lead?.phone || null
  if (!clientEmail && !clientPhone) fail(422, 'email o teléfono es obligatorio para avisar al cliente')
  const timezone = parseTimezone(input.timezone) ?? null
  const notes = optionalText(input.notes, 'Notas del tour') ?? null

  const nowTs = now()
  const resolved: Array<{
    propertyId: number | null
    propertyKind: PropertyKind | null
    propertyName: string | null
    agentId: number
    agentName: string
    officeId: number | null
    scheduledAt: string
    endsAt: string
    durationMinutes: number
    channel: string
    meetingPoint: string | null
  }> = []

  for (const [index, stop] of input.stops.entries()) {
    const label = `Parada ${index + 1}`
    const scheduledAt = normalizeDateTime(stop.scheduledAt, label)
    const agent = await loadAgent(db, orgId, Number(stop.agentId), `${label}: comercial no encontrado`)

    let propertyName: string | null = null
    let propertyKind: PropertyKind | null = null
    if (stop.propertyId) {
      // Igual que una cita suelta (adminCreate.ts): el inmueble tiene que ser
      // de esta agencia, de SU catálogo, y no estar en la papelera.
      propertyKind = parsePropertyKind(stop.propertyKind || 'developer')
      const state = await propertyState(db, orgId, propertyKind, stop.propertyId)
      if (state === 'missing') fail(404, `${label}: inmueble no encontrado`)
      if (state === 'trashed') fail(422, `${label}: ${trashedPropertyMessage('incluirla en un tour')}`)
      propertyName = await propertyDisplayName(db, orgId, propertyKind, stop.propertyId)
    }

    const { endsAt, durationMinutes } = resolveEnd(scheduledAt, stop, agent.slotDurationMinutes, label)

    const clash = resolved.find((r) => r.agentId === agent.id && overlaps(scheduledAt, endsAt, r.scheduledAt, r.endsAt))
    if (clash) fail(422, `${label}: se solapa con otra parada de este mismo tour para ${agent.name}`)
    if (await hasOverlappingVisit(db, orgId, agent.id, scheduledAt, endsAt)) fail(409, `${label}: ${agent.name} ya tiene otra cita a esa hora`)

    resolved.push({
      propertyId: stop.propertyId || null,
      propertyKind,
      propertyName,
      agentId: agent.id,
      agentName: agent.name,
      officeId: agent.officeId ?? null,
      scheduledAt,
      endsAt,
      durationMinutes,
      channel: resolveChannel('property_viewing', stop.channel),
      meetingPoint: optionalText(stop.meetingPoint, `${label}: punto de encuentro`, 300) ?? null,
    })
  }

  const [tour] = await db
    .insert(schema.propertyTours)
    .values({ organizationId: orgId, clientName, clientEmail, clientPhone, leadId: lead?.id ?? null, notes, createdAt: nowTs })
    .returning({ id: schema.propertyTours.id })

  try {
    const results = await db.batch(
      resolved.map((stop, index) =>
        db
          .insert(schema.visits)
          .values({
            organizationId: orgId,
            clientName,
            clientEmail,
            clientPhone,
            propertyId: stop.propertyId,
            propertyName: stop.propertyName,
            propertyKind: stop.propertyKind,
            agentId: stop.agentId,
            agentName: stop.agentName,
            officeId: stop.officeId,
            timezone,
            scheduledAt: stop.scheduledAt,
            durationMinutes: stop.durationMinutes,
            endsAt: stop.endsAt,
            status: 'scheduled',
            channel: stop.channel,
            type: 'property_viewing',
            meetingPoint: stop.meetingPoint,
            leadId: lead?.id ?? null,
            contactId: contact?.id ?? null,
            reminderStatus: initialReminderStatus(clientEmail, clientPhone),
            videoLink: stop.channel === 'video' ? generateVideoLink() : null,
            tourId: tour.id,
            tourStopOrder: index,
            managementToken: generateManagementToken(),
            createdBy: input.createdBy ?? null,
            createdAt: nowTs,
            updatedAt: nowTs,
          })
          .returning({ id: schema.visits.id }),
      ),
    )
    const stopIds = results.map((r: any) => r[0].id)

    const activityContactId = contact?.id ?? lead?.contactId ?? null
    for (const [index, stopId] of stopIds.entries()) {
      const stop = resolved[index]
      await recordActivity(db, orgId, {
        eventType: 'APPOINTMENT_CREATED',
        entityType: 'visit',
        entityId: stopId,
        appointmentId: stopId,
        leadId: lead?.id ?? null,
        contactId: activityContactId,
        propertyId: stop.propertyId,
        propertyKind: stop.propertyKind,
        actorType: 'user',
        actorId: input.createdBy ?? null,
        metadata: { tourId: tour.id, tourStopOrder: index },
      })
    }
    if (lead) {
      await syncLeadNextAction(db, orgId, lead.id)
      await markFirstAppointment(db, orgId, lead.id)
    }

    return { id: tour.id, stopIds }
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

async function loadTourOrThrow(db: any, orgId: number, tourId: number) {
  if (!Number.isInteger(tourId) || tourId <= 0) fail(400, 'Tour no válido')
  const [tour] = await db.select().from(schema.propertyTours).where(and(eq(schema.propertyTours.id, tourId), eq(schema.propertyTours.organizationId, orgId))).limit(1)
  if (!tour) fail(404, 'Tour no encontrado')
  return tour
}

async function loadTourStops(db: any, orgId: number, tourId: number): Promise<any[]> {
  return db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.tourId, tourId)))
    .orderBy(asc(schema.visits.tourStopOrder), asc(schema.visits.scheduledAt))
}

export interface UpdateTourInput {
  clientName?: string
  clientEmail?: string | null
  clientPhone?: string | null
  leadId?: number | null
  contactId?: number | null
  notes?: string | null
}

/**
 * Edita la cabecera de un tour: cliente, lead, contacto y notas. El cliente,
 * el lead y el contacto son de TODAS las paradas, así que se propagan a cada
 * una (cada parada es una cita real y su ficha tiene que decir lo mismo).
 */
export async function updateTour(db: any, orgId: number, tourId: number, input: UpdateTourInput): Promise<{ id: number }> {
  const tour = await loadTourOrThrow(db, orgId, tourId)
  const stops = await loadTourStops(db, orgId, tourId)
  const header: Record<string, any> = {}
  const stopPatch: Record<string, any> = {}

  const leadId = optionalId(input.leadId, 'Lead')
  const contactId = optionalId(input.contactId, 'Contacto')
  const currentContactId = stops.find((s) => s.contactId)?.contactId ?? null
  if (leadId !== undefined || contactId !== undefined) {
    const nextLeadId = leadId !== undefined ? leadId : tour.leadId
    // Sin contacto explícito se conserva el que había, salvo que el lead nuevo ya tenga a su persona.
    let nextContactId = contactId !== undefined ? contactId : currentContactId
    if (contactId === undefined && leadId) nextContactId = (await loadLead(db, orgId, leadId)).contactId ?? currentContactId
    const { lead, contact } = await resolveLeadAndContact(db, orgId, nextLeadId, nextContactId)
    header.leadId = lead?.id ?? null
    stopPatch.leadId = lead?.id ?? null
    stopPatch.contactId = contact?.id ?? null
  }
  if (input.clientName !== undefined) {
    const name = String(input.clientName || '').trim()
    if (!name) fail(422, 'El nombre del cliente es obligatorio')
    header.clientName = stopPatch.clientName = name
  }
  const email = optionalText(input.clientEmail, 'Email', 200)
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'El email no tiene un formato válido')
    header.clientEmail = stopPatch.clientEmail = email
  }
  const phone = optionalText(input.clientPhone, 'Teléfono', 50)
  if (phone !== undefined) header.clientPhone = stopPatch.clientPhone = phone
  const finalEmail = header.clientEmail !== undefined ? header.clientEmail : tour.clientEmail
  const finalPhone = header.clientPhone !== undefined ? header.clientPhone : tour.clientPhone
  if (!finalEmail && !finalPhone) fail(422, 'email o teléfono es obligatorio para avisar al cliente')
  const notes = optionalText(input.notes, 'Notas del tour')
  if (notes !== undefined) header.notes = notes

  if (!Object.keys(header).length && !Object.keys(stopPatch).length) fail(422, 'Nada que actualizar')
  if (Object.keys(header).length) await db.update(schema.propertyTours).set(header).where(and(eq(schema.propertyTours.id, tourId), eq(schema.propertyTours.organizationId, orgId)))
  if (Object.keys(stopPatch).length) {
    stopPatch.updatedAt = now()
    if (stopPatch.clientEmail !== undefined || stopPatch.clientPhone !== undefined) {
      // Las paradas con un recordatorio ya enviado conservan su estado.
      for (const s of stops) {
        const reminderStatus = s.reminder24hSentAt || s.reminder1hSentAt ? s.reminderStatus : initialReminderStatus(finalEmail, finalPhone)
        await db.update(schema.visits).set({ ...stopPatch, reminderStatus }).where(and(eq(schema.visits.id, s.id), eq(schema.visits.organizationId, orgId)))
      }
    } else {
      await db.update(schema.visits).set(stopPatch).where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.tourId, tourId)))
    }
  }
  if (stopPatch.leadId !== undefined) {
    const leads = new Set<number>([tour.leadId, ...stops.map((s) => s.leadId), stopPatch.leadId].filter(Boolean))
    for (const id of leads) await syncLeadNextAction(db, orgId, id)
    if (stopPatch.leadId) await markFirstAppointment(db, orgId, stopPatch.leadId)
  }
  return { id: tourId }
}

export interface ReorderTourInput {
  /** Todas las paradas del tour, en el orden nuevo. */
  stopIds: number[]
  /** Encadenar de nuevo las horas en el orden nuevo (cada parada conserva su duración). */
  recalculate?: boolean
  /** Margen de desplazamiento entre paradas al recalcular (minutos). */
  gapMinutes?: number | null
  /** Hora de inicio de la primera parada al recalcular; sin ella, la más temprana actual. */
  startAt?: string | null
}

/**
 * Reordena las paradas de un tour (FASE 18, «optimizar la ruta» a mano) y,
 * si se pide, recalcula sus horas: la primera empieza en `startAt` y cada
 * siguiente al acabar la anterior más el margen, conservando la duración
 * propia de cada parada (utils/tourPlanning.ts). Las paradas canceladas no
 * se mueven. Si alguna ya se ha hecho (o el cliente no vino), las horas no se
 * recalculan: el tour ya empezó y cada parada se mueve por separado.
 *
 * Los cambios de hora pasan la misma comprobación de solapes que cualquier
 * cita (contra la agenda real de cada comercial, sin contar las paradas del
 * propio tour, que se mueven a la vez), invalidan la confirmación y reinician
 * los recordatorios de la parada movida, quedan en Activity y avisan al cliente.
 */
export async function reorderTour(
  db: any,
  orgId: number,
  tourId: number,
  input: ReorderTourInput,
  ctx: { userId?: number | null; env?: Record<string, any>; requestId?: string | null; publicOrigin?: string | null } = {},
): Promise<{ id: number; moved: number[] }> {
  await loadTourOrThrow(db, orgId, tourId)
  const stops = await loadTourStops(db, orgId, tourId)
  const ids = (input.stopIds || []).map(Number)
  const known = new Set(stops.map((s) => s.id))
  if (ids.length !== stops.length || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    fail(422, 'El orden tiene que incluir cada parada del tour exactamente una vez')
  }
  const byId = new Map(stops.map((s) => [s.id, s]))
  const ordered = ids.map((id) => byId.get(id)!)

  const newTimes = new Map<number, { scheduledAt: string; endsAt: string }>()
  if (input.recalculate) {
    const active = ordered.filter((s) => s.status !== 'cancelled')
    if (active.some((s) => s.status !== 'scheduled')) fail(422, 'El tour ya ha empezado (hay paradas realizadas o sin asistencia): mueve cada parada por separado')
    if (active.length) {
      const gap = input.gapMinutes === undefined || input.gapMinutes === null ? DEFAULT_TOUR_GAP_MINUTES : Number(input.gapMinutes)
      if (!Number.isInteger(gap) || gap < 0 || gap > MAX_TOUR_GAP_MINUTES) fail(422, `El margen entre paradas tiene que estar entre 0 y ${MAX_TOUR_GAP_MINUTES} minutos`)
      const startAt = input.startAt ? normalizeDateTime(input.startAt, 'Inicio del tour') : active.map((s) => s.scheduledAt).sort()[0]
      const plan = planSequentialSchedule(
        active.map((s) => ({ durationMinutes: s.endsAt ? Math.max(5, minutesBetween(s.scheduledAt, s.endsAt)) : s.durationMinutes })),
        { startAt, gapMinutes: gap },
      )
      const tourIds = stops.map((s) => s.id)
      for (const [i, s] of active.entries()) {
        const next = plan[i]
        if (next.scheduledAt === s.scheduledAt && next.endsAt === s.endsAt) continue
        if (s.agentId && (await hasOverlappingVisit(db, orgId, s.agentId, next.scheduledAt, next.endsAt, tourIds))) {
          fail(409, `Parada ${i + 1}: ${s.agentName || 'el comercial'} ya tiene otra cita a esa hora`)
        }
        newTimes.set(s.id, next)
      }
    }
  }

  const nowTs = now()
  // Dos fases: primero cada parada movida pasa por una hora provisional
  // única y luego a la definitiva. Intercambiar dos horas del mismo
  // comercial en una sola pasada chocaría con visits_agent_slot_unique a
  // mitad del lote; db.batch() es atómico, así que nadie ve el estado intermedio.
  const statements: any[] = []
  for (const [id] of newTimes) {
    statements.push(db.update(schema.visits).set({ scheduledAt: `${byId.get(id)!.scheduledAt}#${id}` }).where(and(eq(schema.visits.id, id), eq(schema.visits.organizationId, orgId))))
  }
  for (const [order, s] of ordered.entries()) {
    const t = newTimes.get(s.id)
    const set: Record<string, any> = { tourStopOrder: order, updatedAt: nowTs }
    if (t) {
      Object.assign(set, {
        scheduledAt: t.scheduledAt,
        endsAt: t.endsAt,
        durationMinutes: minutesBetween(t.scheduledAt, t.endsAt),
        reminder24hSentAt: null,
        reminder1hSentAt: null,
        reminderStatus: initialReminderStatus(s.clientEmail, s.clientPhone),
      })
      if (s.confirmationStatus !== 'pending') Object.assign(set, { confirmationStatus: 'pending', confirmedAt: null })
    } else if (s.tourStopOrder === order) {
      continue
    }
    statements.push(db.update(schema.visits).set(set).where(and(eq(schema.visits.id, s.id), eq(schema.visits.organizationId, orgId))))
  }
  if (statements.length) {
    try {
      await db.batch(statements)
    } catch (e: any) {
      if (String(e?.cause?.message || e?.message || '').includes('UNIQUE constraint failed')) fail(409, 'Una de las paradas ya no está disponible a la hora calculada, vuelve a intentarlo.')
      throw e
    }
  }

  const moved = [...newTimes.keys()]
  const leadIds = new Set<number>()
  for (const id of moved) {
    const s = byId.get(id)!
    const t = newTimes.get(id)!
    await recordActivity(db, orgId, {
      eventType: 'APPOINTMENT_RESCHEDULED',
      entityType: 'visit',
      entityId: id,
      appointmentId: id,
      leadId: s.leadId,
      contactId: s.contactId,
      propertyId: s.propertyId,
      propertyKind: s.propertyKind,
      actorType: 'user',
      actorId: ctx.userId ?? null,
      metadata: { from: s.scheduledAt, to: t.scheduledAt, tourId },
    })
    if (s.leadId) leadIds.add(s.leadId)
    try {
      await notifyAppointment(db, ctx.env || {}, {
        organizationId: orgId,
        visitId: id,
        type: 'rescheduled',
        recipientEmail: s.clientEmail,
        recipientPhone: s.clientPhone,
        message: `Tu cita ha sido reprogramada al ${t.scheduledAt} con ${s.agentName || 'tu agente'}.`,
        scheduledAt: t.scheduledAt,
        agentName: s.agentName,
        requestId: ctx.requestId ?? null,
        publicOrigin: ctx.publicOrigin ?? null,
      })
    } catch {
      // El cambio ya quedó guardado — un fallo al notificar nunca debe deshacerlo.
    }
  }
  for (const id of leadIds) await syncLeadNextAction(db, orgId, id)
  return { id: tourId, moved }
}

/** Tours de la organización con sus paradas (y el resultado y las ofertas de cada una), más recientes primero. */
export async function listTours(db: any, orgId: number): Promise<TourView[]> {
  const tours = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.organizationId, orgId)).orderBy(schema.propertyTours.createdAt)
  if (!tours.length) return []

  const stopRows = await db.select().from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), isNotNull(schema.visits.tourId)))
  const offersByVisit = await attachRelatedOffers(db, orgId, stopRows as any[])
  const leadIds = [...new Set((tours as any[]).map((t) => t.leadId).filter(Boolean))] as number[]
  const leadNames = new Map<number, string>()
  for (const l of await selectInChunks(leadIds, (part) => db.select({ id: schema.leads.id, name: schema.leads.name }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), inArray(schema.leads.id, part))))) leadNames.set((l as any).id, (l as any).name)
  const contactIds = [...new Set((stopRows as any[]).map((v) => v.contactId).filter(Boolean))] as number[]
  const contactNames = new Map<number, string>()
  for (const c of await selectInChunks(contactIds, (part) => db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).where(and(eq(schema.contacts.organizationId, orgId), inArray(schema.contacts.id, part))))) contactNames.set((c as any).id, (c as any).name)

  const stopsByTour = new Map<number, TourStopView[]>()
  for (const v of stopRows as any[]) {
    const list = stopsByTour.get(v.tourId) || []
    list.push({
      id: v.id,
      propertyId: v.propertyId,
      propertyKind: v.propertyKind,
      propertyName: v.propertyName,
      agentId: v.agentId,
      agentName: v.agentName,
      scheduledAt: v.scheduledAt,
      endsAt: v.endsAt,
      durationMinutes: v.durationMinutes,
      status: v.status,
      channel: v.channel,
      confirmationStatus: v.confirmationStatus,
      cancellationReason: v.cancellationReason,
      meetingPoint: v.meetingPoint,
      tourStopOrder: v.tourStopOrder ?? 0,
      managementToken: v.managementToken,
      leadId: v.leadId,
      contactId: v.contactId,
      clientName: v.clientName,
      clientEmail: v.clientEmail,
      clientPhone: v.clientPhone,
      outcome: v.outcome,
      outcomeNotes: v.outcomeNotes,
      interestLevel: v.interestLevel,
      outcomeLiked: v.outcomeLiked,
      outcomeDisliked: v.outcomeDisliked,
      pricePerception: v.pricePerception,
      locationRating: v.locationRating,
      conditionRating: v.conditionRating,
      layoutRating: v.layoutRating,
      wantsSecondVisit: v.wantsSecondVisit,
      wantsToOffer: v.wantsToOffer,
      discarded: v.discarded,
      offers: offersByVisit.get(v.id) || [],
    })
    stopsByTour.set(v.tourId, list)
  }

  return (tours as any[])
    .map((t) => {
      const stops = (stopsByTour.get(t.id) || []).sort((a, b) => a.tourStopOrder - b.tourStopOrder)
      const contactId = stops.find((s) => s.contactId)?.contactId ?? null
      return {
        id: t.id,
        clientName: t.clientName,
        clientEmail: t.clientEmail,
        clientPhone: t.clientPhone,
        leadId: t.leadId,
        leadName: t.leadId ? (leadNames.get(t.leadId) ?? null) : null,
        contactId,
        contactName: contactId ? (contactNames.get(contactId) ?? null) : null,
        notes: t.notes,
        createdAt: t.createdAt,
        stops,
      }
    })
    .reverse()
}

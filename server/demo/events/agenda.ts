import { createAdminAppointment } from '../../utils/appointments/adminCreate'
import { updateAppointment } from '../../utils/appointments/update'
import { recordVisitOutcome } from '../../utils/appointments/outcome'
import { createTour } from '../../utils/appointments/tours'
import { createTask, updateTask } from '../../utils/tasks/service'
import { ctxId, ctxSetId, utcAt, wallAt, type DemoContext } from '../context'
import { actingUser, commercialId, contactId, hasId, leadId, officeId, orgId, propertyId, propertyKindOf } from '../helpers'
import { APPOINTMENTS, TASKS, TOURS, type DemoAppointment, type DemoOutcome } from '../dataset/agenda'
import { after, fromMinutes, toMinutes } from '../moments'
import { COMMERCIALS } from '../dataset/company'
import type { TimelineBuilder } from '../timeline'

/**
 * La agenda en el tiempo: cada cita se reserva unos días antes (como en la
 * realidad) y, llegada su hora, se completa —con el resultado de la visita—,
 * se cancela con su motivo o se marca «no asistió». Tours con sus paradas y
 * tareas que se crean, se trabajan y se cierran en su fecha.
 */

const DEMO_TZ = 'Europe/Madrid'

/**
 * Cuándo se reserva: unos días antes, como muy tarde ayer para las futuras
 * (nada se apunta «en el futuro») y nunca antes de que existan el contacto, el
 * lead, la operación o —salvo en una captación— la propiedad.
 */
/** Visitas que ocurren antes de que la propiedad esté dada de alta (se capta después). */
const PRE_LISTING_TYPES = new Set(['listing', 'valuation'])

function bookingMoment(a: { days: number; contact?: string; lead?: string; property?: string; deal?: string; type?: string }, ahead = 3): { days: number; at: string } {
  const wanted = toMinutes(Math.min(a.days - ahead, -1), '10:05')
  const ready = after({ contact: a.contact, lead: a.lead, deal: a.deal, property: PRE_LISTING_TYPES.has(a.type ?? '') ? null : a.property })
  return fromMinutes(Math.max(wanted, ready))
}

function endOf(at: string, minutes: number): string {
  const [h, m] = at.split(':').map(Number)
  const t = Math.min(h * 60 + m + minutes + 10, 23 * 60 + 50)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function outcomeInput(o: DemoOutcome) {
  return {
    outcome: o.outcome,
    interestLevel: o.interest,
    liked: o.liked ?? null,
    disliked: o.disliked ?? null,
    pricePerception: o.price ?? null,
    locationRating: o.location ?? null,
    conditionRating: o.condition ?? null,
    layoutRating: o.layout ?? null,
    wantsSecondVisit: o.secondVisit ?? null,
    wantsToOffer: o.wantsToOffer ?? null,
    discarded: o.discarded ?? null,
    notes: o.notes ?? null,
  }
}

async function bookAppointment(ctx: DemoContext, a: DemoAppointment) {
  const actor = actingUser(ctx, a.commercial)
  const commercial = COMMERCIALS.find((c) => c.key === a.commercial)!
  const listed = Boolean(a.property && hasId(ctx, `prop:${a.property}`))
  const visit: any = await createAdminAppointment(ctx.db, orgId(ctx), {
    clientName: a.title ?? null,
    agentId: commercialId(ctx, a.commercial),
    // Una visita de captación o valoración puede ser anterior a la ficha: entonces va sin ella.
    propertyId: listed ? propertyId(ctx, a.property!) : null,
    propertyKind: listed ? propertyKindOf(a.property!) : null,
    scheduledAt: wallAt(ctx.state.anchorDay!, a.days, a.at),
    durationMinutes: a.minutes ?? 45,
    type: a.type,
    leadId: a.lead ? leadId(ctx, a.lead) : null,
    contactId: a.contact ? contactId(ctx, a.contact) : null,
    officeId: officeId(ctx, commercial.office),
    timezone: DEMO_TZ,
    meetingPoint: a.meetingPoint ?? (a.type === 'property_viewing' ? 'En la propiedad' : null),
    notes: a.notes ?? null,
    confirmationStatus: a.status === 'scheduled' && a.days > 1 ? 'pending' : 'confirmed_internal',
    dealId: a.deal ? ctxId(ctx, `deal:${a.deal}`) : null,
    createdBy: actor.id,
  })
  ctxSetId(ctx, `visit:${a.key}`, Number(visit.id))
}

async function closeAppointment(ctx: DemoContext, key: string, commercialKey: string, status: 'completed' | 'cancelled' | 'no_show', opts: { reason?: string; outcome?: DemoOutcome }) {
  const actor = actingUser(ctx, commercialKey)
  const visitId = ctxId(ctx, `visit:${key}`)
  await updateAppointment(ctx.db, orgId(ctx), visitId, { status, ...(status === 'cancelled' ? { cancellationReason: opts.reason || 'Cancelada' } : {}) }, { userId: actor.id, env: ctx.env, requestId: 'demo-seed' })
  if (status === 'completed' && opts.outcome) {
    await recordVisitOutcome(ctx.db, orgId(ctx), visitId, outcomeInput(opts.outcome), { actorId: actor.id })
  }
}

export function addAgendaEvents(tl: TimelineBuilder): void {
  for (const a of APPOINTMENTS) {
    const booking = bookingMoment(a)
    tl.add(booking.days, booking.at, `Cita ${a.key}`, (ctx) => bookAppointment(ctx, a))
    if (a.status === 'completed' || a.status === 'no_show') {
      tl.add(a.days, endOf(a.at, a.minutes ?? 45), `Resultado ${a.key}`, (ctx) => closeAppointment(ctx, a.key, a.commercial, a.status as 'completed' | 'no_show', { outcome: a.outcome }))
    } else if (a.status === 'cancelled') {
      tl.add(a.days - 1, '18:30', `Cancelación ${a.key}`, (ctx) => closeAppointment(ctx, a.key, a.commercial, 'cancelled', { reason: a.cancelReason }))
    }
  }

  for (const tour of TOURS) {
    const booking = fromMinutes(Math.max(toMinutes(Math.min(tour.days - 5, -1), '12:30'), ...tour.stops.map((st) => after({ contact: tour.contact, lead: tour.lead, property: st.property }))))
    tl.add(booking.days, booking.at, `Tour ${tour.key}`, async (ctx) => {
      const actor = actingUser(ctx, tour.stops[0].commercial)
      const res = await createTour(ctx.db, orgId(ctx), {
        leadId: leadId(ctx, tour.lead),
        contactId: contactId(ctx, tour.contact),
        notes: tour.notes,
        timezone: DEMO_TZ,
        createdBy: actor.id,
        stops: tour.stops.map((s) => ({
          propertyId: propertyId(ctx, s.property),
          propertyKind: propertyKindOf(s.property),
          agentId: commercialId(ctx, s.commercial),
          scheduledAt: wallAt(ctx.state.anchorDay!, tour.days, s.at),
          durationMinutes: s.minutes,
          channel: 'in_person' as const,
        })),
      })
      ctxSetId(ctx, `tour:${tour.key}`, res.id)
      res.stopIds.forEach((id, i) => ctxSetId(ctx, `visit:${tour.key}-${i}`, id))
    })
    tour.stops.forEach((s, i) => {
      if (s.status !== 'completed') return
      tl.add(tour.days, endOf(s.at, s.minutes), `Parada ${tour.key}-${i}`, (ctx) => closeAppointment(ctx, `${tour.key}-${i}`, s.commercial, 'completed', { outcome: s.outcome }))
    })
  }

  for (const k of TASKS) {
    const appointment = k.appointment ? APPOINTMENTS.find((x) => x.key === k.appointment) : undefined
    const created = fromMinutes(
      Math.max(toMinutes(k.createdDays, '16:00'), after({ contact: k.contact, lead: k.lead, property: k.property, deal: k.deal }), appointment ? toMinutes(bookingMoment(appointment).days, bookingMoment(appointment).at) + 10 : -Infinity),
    )
    tl.add(created.days, created.at, `Tarea ${k.key}`, async (ctx) => {
      const actor = actingUser(ctx, k.assignee)
      const task = await createTask(
        ctx.db,
        orgId(ctx),
        {
          type: k.type,
          title: k.title,
          assigneeId: commercialId(ctx, k.assignee),
          dueAt: utcAt(ctx.state.anchorDay!, k.dueDays, k.dueAt),
          priority: k.priority,
          status: k.status === 'in_progress' ? 'in_progress' : 'open',
          contactId: k.contact ? contactId(ctx, k.contact) : null,
          leadId: k.lead ? leadId(ctx, k.lead) : null,
          propertyId: k.property ? propertyId(ctx, k.property) : null,
          propertyKind: k.property ? propertyKindOf(k.property) : null,
          appointmentId: k.appointment ? ctxId(ctx, `visit:${k.appointment}`) : null,
          dealId: k.deal ? ctxId(ctx, `deal:${k.deal}`) : null,
        },
        { createdBy: actor.id },
      )
      ctxSetId(ctx, `task:${k.key}`, task.id)
    })
    if ((k.status === 'completed' || k.status === 'cancelled') && k.doneDays != null) {
      const done = fromMinutes(Math.max(toMinutes(k.doneDays, '18:10'), toMinutes(created.days, created.at) + 30))
      tl.add(done.days, done.at, `Cierre tarea ${k.key}`, async (ctx) => {
        await updateTask(ctx.db, orgId(ctx), ctxId(ctx, `task:${k.key}`), { status: k.status }, { actorId: actingUser(ctx, k.assignee).id })
      })
    }
  }
}

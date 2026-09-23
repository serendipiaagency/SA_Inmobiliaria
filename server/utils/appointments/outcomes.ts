import { and, asc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema, now } from '../db'
import { AppointmentError, reorderStops, validateOutcome, type OutcomeInput } from './types'

/**
 * Resultados de visita y tours (FASES 18-19).
 *
 * REGLA QUE ATRAVIESA TODO EL ARCHIVO: aquí sólo se escribe en `visit_outcomes`,
 * `property_tours`, `property_tour_stops` y `visits`. **Nunca** en
 * `agent_properties` ni en `buyer_requirements`.
 *
 * El motivo no es purismo: "la cocina está anticuada" es lo que opinó una
 * persona una tarde. Si eso cambiara el estado oficial del inmueble, el
 * siguiente comprador vería como hecho comprobado lo que fue el mal día de
 * otro, y la ficha acabaría reflejando al visitante más quejica en lugar de al
 * inmueble. Lo mismo con la necesidad del comprador: que un piso le parezca
 * caro no significa que haya bajado su presupuesto.
 *
 * Hay un test (`appointmentOutcome.test.ts`) que falla si este archivo empieza
 * a escribir en esos campos.
 */

async function loadVisit(event: H3Event, orgId: number, visitId: number) {
  const db = useDb(event)
  return (
    await db
      .select()
      .from(schema.visits)
      .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
      .limit(1)
  )[0]
}

/**
 * Guarda el resultado de una visita. Uno por cita: si ya existe se actualiza,
 * porque dos resultados contradictorios sobre la misma visita harían imposible
 * responder "¿le gustó o no?".
 */
export async function saveOutcome(
  event: H3Event,
  orgId: number,
  visitId: number,
  input: OutcomeInput,
  opts: { userId?: number | null } = {},
) {
  validateOutcome(input)

  const visit = await loadVisit(event, orgId, visitId)
  if (!visit) throw new AppointmentError('Cita no encontrada')

  const db = useDb(event)
  const nowTs = now()

  const values = {
    completed: input.completed == null ? null : input.completed ? 1 : 0,
    interestScore: input.interestScore ?? null,
    liked: input.liked || null,
    disliked: input.disliked || null,
    pricePerception: input.pricePerception || null,
    locationFeedback: input.locationFeedback || null,
    conditionFeedback: input.conditionFeedback || null,
    layoutFeedback: input.layoutFeedback || null,
    wantsSecondViewing: input.wantsSecondViewing ? 1 : 0,
    wantsOffer: input.wantsOffer ? 1 : 0,
    discarded: input.discarded ? 1 : 0,
    discardReason: input.discarded ? input.discardReason || null : null,
    followUpRequired: input.followUpRequired ? 1 : 0,
    followUpAt: input.followUpRequired ? input.followUpAt || null : null,
    notes: input.notes || null,
    updatedAt: nowTs,
  }

  const existing = (
    await db
      .select({ id: schema.visitOutcomes.id })
      .from(schema.visitOutcomes)
      .where(and(eq(schema.visitOutcomes.visitId, visitId), eq(schema.visitOutcomes.organizationId, orgId)))
      .limit(1)
  )[0]

  if (existing) {
    await db
      .update(schema.visitOutcomes)
      .set(values)
      .where(and(eq(schema.visitOutcomes.id, existing.id), eq(schema.visitOutcomes.organizationId, orgId)))
  } else {
    await db
      .insert(schema.visitOutcomes)
      .values({ organizationId: orgId, visitId, ...values, createdBy: opts.userId ?? null, createdAt: nowTs })
  }

  // La cita sí refleja si se realizó: eso es un hecho de la agenda, no una
  // opinión. El resto del feedback no toca nada fuera de visit_outcomes.
  if (input.completed != null) {
    await db
      .update(schema.visits)
      .set({ status: input.completed ? 'completed' : 'no_show' })
      .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
  }

  return (
    await db
      .select()
      .from(schema.visitOutcomes)
      .where(and(eq(schema.visitOutcomes.visitId, visitId), eq(schema.visitOutcomes.organizationId, orgId)))
      .limit(1)
  )[0]
}

export async function outcomeFor(event: H3Event, orgId: number, visitId: number) {
  const db = useDb(event)
  return (
    await db
      .select()
      .from(schema.visitOutcomes)
      .where(and(eq(schema.visitOutcomes.visitId, visitId), eq(schema.visitOutcomes.organizationId, orgId)))
      .limit(1)
  )[0]
}

/** Crea un tour con sus paradas, en el orden dado. */
export async function createTour(
  event: H3Event,
  orgId: number,
  input: {
    title?: string
    contactId?: number | null
    leadId?: number | null
    buyerRequirementId?: number | null
    commercialId?: number | null
    scheduledDate?: string | null
    propertyIds: number[]
    notes?: string | null
  },
  opts: { userId?: number | null } = {},
) {
  if (!input.propertyIds?.length) throw new AppointmentError('Un tour necesita al menos un inmueble')

  const db = useDb(event)
  const nowTs = now()

  // Los inmuebles tienen que ser de esta organización. Sin esto, pasar ids de
  // otra agencia crearía un tour por sus pisos.
  const owned = await db
    .select({ id: schema.agentProperties.id })
    .from(schema.agentProperties)
    .where(eq(schema.agentProperties.organizationId, orgId))
  const ownedIds = new Set(owned.map((p) => p.id))
  const valid = input.propertyIds.filter((id) => ownedIds.has(id))
  if (!valid.length) throw new AppointmentError('Ninguno de los inmuebles indicados es de esta organización')

  const [tour] = await db
    .insert(schema.propertyTours)
    .values({
      organizationId: orgId,
      title: (input.title || '').trim(),
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      buyerRequirementId: input.buyerRequirementId ?? null,
      commercialId: input.commercialId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      status: 'planned',
      notes: input.notes ?? null,
      createdBy: opts.userId ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await db.insert(schema.propertyTourStops).values(
    valid.map((propertyId, index) => ({
      organizationId: orgId,
      tourId: tour.id,
      propertyId,
      sortOrder: index,
      status: 'planned',
      createdAt: nowTs,
      updatedAt: nowTs,
    })),
  )

  return tour
}

/** Un tour con sus paradas en orden. La hora de cada parada sale de su cita, no del tour. */
export async function tourWithStops(event: H3Event, orgId: number, tourId: number) {
  const db = useDb(event)
  const tour = (
    await db
      .select()
      .from(schema.propertyTours)
      .where(and(eq(schema.propertyTours.id, tourId), eq(schema.propertyTours.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!tour) return null

  const stops = await db
    .select()
    .from(schema.propertyTourStops)
    .where(and(eq(schema.propertyTourStops.tourId, tourId), eq(schema.propertyTourStops.organizationId, orgId)))
    .orderBy(asc(schema.propertyTourStops.sortOrder), asc(schema.propertyTourStops.id))

  return { tour, stops }
}

/**
 * Cambia el orden de las paradas. Sólo toca `sort_order`: las horas viven en
 * las citas y no se tocan aquí, para que no existan dos versiones del horario
 * que puedan contradecirse.
 */
export async function reorderTour(event: H3Event, orgId: number, tourId: number, stopIds: number[]) {
  const db = useDb(event)
  const nowTs = now()

  const stops = await db
    .select({ id: schema.propertyTourStops.id })
    .from(schema.propertyTourStops)
    .where(and(eq(schema.propertyTourStops.tourId, tourId), eq(schema.propertyTourStops.organizationId, orgId)))
  const valid = new Set(stops.map((s) => s.id))

  for (const { id, sortOrder } of reorderStops(stopIds.filter((id) => valid.has(id)))) {
    await db
      .update(schema.propertyTourStops)
      .set({ sortOrder, updatedAt: nowTs })
      .where(and(eq(schema.propertyTourStops.id, id), eq(schema.propertyTourStops.organizationId, orgId)))
  }

  return tourWithStops(event, orgId, tourId)
}

/**
 * Cancela una parada sin cancelar el tour entero: que un piso se caiga no
 * anula la tarde.
 */
export async function cancelStop(event: H3Event, orgId: number, stopId: number, reason?: string | null) {
  const db = useDb(event)
  await db
    .update(schema.propertyTourStops)
    .set({ status: 'cancelled', notes: reason || null, updatedAt: now() })
    .where(and(eq(schema.propertyTourStops.id, stopId), eq(schema.propertyTourStops.organizationId, orgId)))

  return (
    await db
      .select()
      .from(schema.propertyTourStops)
      .where(and(eq(schema.propertyTourStops.id, stopId), eq(schema.propertyTourStops.organizationId, orgId)))
      .limit(1)
  )[0]
}

import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { createTask } from '../tasks/service'
import { createOffer } from '../offers/service'
import { advancePropertyMatches } from '../matching/service'
import { assertLiveProperty } from '../properties/trash'
import { PRICE_PERCEPTIONS, VISIT_OUTCOMES } from '../../../utils/appointmentCatalog'
import { createAdminAppointment } from './adminCreate'
import { fail, loadContact, normalizeDateTime, optionalId, optionalText } from './fields'

/**
 * Resultado de visita (FASE 19, migraciones 0074 y 0086).
 *
 * Es PERCEPCIÓN del comercial, nunca un hecho: que a un cliente no le
 * convenciera la cocina no cambia las características reales del inmueble,
 * y que reaccionara de una forma en una visita concreta no cambia lo que
 * dice buscar. Por eso este módulo, deliberadamente, no escribe nada en
 * `agent_properties`, `developer_properties` ni `buyer_requirements` — sólo
 * en `visits`, la cita canónica. `test/unit/visitOutcome.test.ts` comprueba
 * que esa frontera se mantiene, fila a fila, no por nombre de columna (una
 * comparación por columna confundiría `visits.status` con el `status` de
 * otra tabla).
 *
 * Resultado estructurado: cómo quedó (interesado / se lo piensa / no le
 * convenció), interés 1-5, qué le gustó y qué no (por separado), percepción
 * del precio, valoración 1-5 de ubicación, estado y distribución, si quiere
 * segunda visita, si quiere ofertar y si DESCARTA el inmueble. De ahí salen
 * acciones reales: una tarea de seguimiento, la segunda visita ya agendada
 * y una oferta en borrador con el OfferService.
 */

export { VISIT_OUTCOMES }
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number]

export function isVisitOutcome(v: unknown): v is VisitOutcome {
  return typeof v === 'string' && (VISIT_OUTCOMES as readonly string[]).includes(v)
}

export interface RecordVisitOutcomeInput {
  outcome: string
  /** Notas generales de la visita. */
  notes?: string | null
  interestLevel?: number | string | null
  /** Qué le gustó (texto propio, separado de lo que no). */
  liked?: string | null
  /** Qué no le gustó. */
  disliked?: string | null
  pricePerception?: string | null
  locationRating?: number | string | null
  conditionRating?: number | string | null
  layoutRating?: number | string | null
  wantsSecondVisit?: boolean | null
  wantsToOffer?: boolean | null
  /** Descarta este inmueble: el PropertyMatch de esta persona con él pasa a «descartado». */
  discarded?: boolean | null
  /** Comprador, si la visita aún no tiene contacto (hace falta para ofertar). Se queda vinculado a la visita. */
  contactId?: number | null
  /** "Seguimiento" (FASE 22 §56): crea una Task real. */
  followUp?: { dueAt: string; assigneeId?: number | null; notes?: string | null } | null
  /** "Segunda visita": la agenda ya, con el mismo comercial (o el elegido), inmueble y cliente. */
  secondVisit?: { scheduledAt: string; endsAt?: string | null; durationMinutes?: number | null; agentId?: number | null } | null
  /**
   * "Oferta" (FASE 23 §86): crea una Offer en borrador vía OfferService — el
   * comercial la revisa y la envía desde la ficha del cliente, no se envía sola.
   */
  createOffer?: { amount: number; conditions?: string | null; financeCondition?: string | null; expiration?: string | null } | null
}

function rating(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) fail(422, `${label}: tiene que ser un número del 1 al 5`)
  return n
}

function flag(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}

export async function recordVisitOutcome(db: any, orgId: number, visitId: number, input: RecordVisitOutcomeInput, opts: { actorId?: number | null } = {}) {
  if (!isVisitOutcome(input.outcome)) throw createError({ statusCode: 422, statusMessage: 'Resultado no reconocido' })

  const rows = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
    .limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })
  if (visit.status !== 'completed') throw createError({ statusCode: 422, statusMessage: 'Sólo se puede anotar el resultado de una visita completada' })

  // --- Validar TODO antes de escribir nada ----------------------------------
  const fields = {
    outcome: input.outcome,
    outcomeNotes: optionalText(input.notes, 'Notas') ?? null,
    interestLevel: rating(input.interestLevel, 'Interés'),
    outcomeLiked: optionalText(input.liked, 'Qué le gustó') ?? null,
    outcomeDisliked: optionalText(input.disliked, 'Qué no le gustó') ?? null,
    pricePerception: null as string | null,
    locationRating: rating(input.locationRating, 'Ubicación'),
    conditionRating: rating(input.conditionRating, 'Estado'),
    layoutRating: rating(input.layoutRating, 'Distribución'),
    wantsSecondVisit: flag(input.wantsSecondVisit),
    wantsToOffer: flag(input.wantsToOffer),
    discarded: flag(input.discarded),
  }
  if (input.pricePerception !== undefined && input.pricePerception !== null && input.pricePerception !== '') {
    if (!(PRICE_PERCEPTIONS as readonly string[]).includes(String(input.pricePerception))) fail(422, 'Percepción del precio no reconocida')
    fields.pricePerception = String(input.pricePerception)
  }
  if (input.secondVisit) fields.wantsSecondVisit = 1
  if (input.createOffer) fields.wantsToOffer = 1
  if (fields.discarded && fields.outcome === 'interested') fail(422, 'Un inmueble descartado no puede quedar como «Interesado»')
  if (fields.discarded && (input.createOffer || input.secondVisit)) fail(422, 'Si descarta el inmueble no se puede ofertar ni agendar una segunda visita sobre él')

  // El comprador: el contacto de la visita, el de su lead o el que se elige ahora.
  const leadContactId = visit.leadId ? ((await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(and(eq(schema.leads.id, visit.leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]?.contactId ?? null) : null
  const chosenContactId = optionalId(input.contactId, 'Contacto')
  let linkContactId: number | null = null
  if (chosenContactId) {
    await loadContact(db, orgId, chosenContactId)
    const existing = visit.contactId ?? leadContactId
    if (existing && existing !== chosenContactId) fail(422, 'Esta visita ya tiene otro contacto vinculado')
    if (!visit.contactId) linkContactId = chosenContactId
  }
  const contactId: number | null = visit.contactId ?? leadContactId ?? chosenContactId ?? null

  let offerTerms: { amount: number; conditions: string | null; financeCondition: string | null; expiration: string | null } | null = null
  if (input.createOffer) {
    if (!(Number(input.createOffer.amount) > 0)) fail(422, 'El importe debe ser mayor que cero')
    const exp = input.createOffer.expiration ? String(input.createOffer.expiration) : null
    offerTerms = {
      amount: Number(input.createOffer.amount),
      conditions: optionalText(input.createOffer.conditions, 'Condiciones') ?? null,
      financeCondition: optionalText(input.createOffer.financeCondition, 'Financiación') ?? null,
      // Una fecha sola vence al final de ese día.
      expiration: exp ? normalizeDateTime(/^\d{4}-\d{2}-\d{2}$/.test(exp) ? `${exp} 23:59:59` : exp, 'Vencimiento de la oferta') : null,
    }
    if (!contactId) fail(422, 'No se puede crear una oferta sin un comprador identificado (esta visita no tiene un contacto vinculado)')
    if (!visit.propertyId || !visit.propertyKind) fail(422, 'No se puede crear una oferta sin inmueble')
    // Una oferta nueva sobre una propiedad que ya está en la papelera se
    // rechaza ANTES de anotar nada: si no, el resultado quedaría guardado y
    // la petición fallaría a medias.
    await assertLiveProperty(db, orgId, visit.propertyKind === 'agent' ? 'agent' : 'developer', visit.propertyId, { action: 'crear una oferta', notFoundMessage: 'Inmueble no encontrado' })
  }
  const followUpDueAt = input.followUp?.dueAt ? normalizeDateTime(input.followUp.dueAt, 'Seguimiento') : null

  // --- Segunda visita: la primera escritura, porque es la que puede chocar (409) ---
  let secondVisitId: number | null = null
  if (input.secondVisit) {
    const agentId = optionalId(input.secondVisit.agentId, 'Comercial') ?? visit.agentId
    if (!agentId) fail(422, 'Elige el comercial de la segunda visita')
    const second = await createAdminAppointment(db, orgId, {
      clientName: visit.clientName,
      clientEmail: visit.clientEmail,
      clientPhone: visit.clientPhone,
      agentId,
      propertyId: visit.propertyId,
      propertyKind: visit.propertyKind as any,
      scheduledAt: input.secondVisit.scheduledAt,
      endsAt: input.secondVisit.endsAt ?? null,
      durationMinutes: input.secondVisit.durationMinutes ?? null,
      channel: visit.channel,
      type: 'property_viewing',
      leadId: visit.leadId,
      contactId: visit.contactId ?? linkContactId ?? null,
      officeId: visit.officeId,
      timezone: visit.timezone,
      meetingPoint: visit.meetingPoint,
      notes: `Segunda visita (la primera fue el ${visit.scheduledAt.slice(0, 16)})`,
      createdBy: opts.actorId ?? null,
    })
    secondVisitId = second.id
  }

  const nowTs = now()
  await db
    .update(schema.visits)
    .set({ ...fields, outcomeRecordedAt: nowTs, updatedAt: nowTs, ...(linkContactId ? { contactId: linkContactId } : {}) })
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))

  // El evento de Activity sólo dice qué se anotó a nivel de negocio — nunca
  // el texto de las notas ni lo que le gustó o no, que puede ser información
  // sensible sobre el cliente.
  await recordActivity(db, orgId, {
    eventType: 'VISIT_OUTCOME_RECORDED',
    entityType: 'visit',
    entityId: visitId,
    appointmentId: visitId,
    leadId: visit.leadId,
    contactId,
    propertyId: visit.propertyId,
    propertyKind: visit.propertyKind as any,
    actorType: 'user',
    actorId: opts.actorId ?? null,
    metadata: { outcome: input.outcome, interestLevel: fields.interestLevel, discarded: !!fields.discarded, wantsSecondVisit: !!fields.wantsSecondVisit, wantsToOffer: !!fields.wantsToOffer },
  })

  // El PropertyMatch de esta persona con este inmueble refleja la visita: descartado si lo descarta o no le convenció.
  if (visit.propertyId && visit.propertyKind && contactId) {
    const discard = !!fields.discarded || input.outcome === 'not_interested'
    await advancePropertyMatches(db, orgId, {
      contactId,
      propertyId: visit.propertyId,
      propertyKind: visit.propertyKind as any,
      to: discard ? 'discarded' : 'viewing',
      reason: fields.discarded ? 'Descartado tras la visita' : input.outcome === 'not_interested' ? 'Tras la visita: no le interesa' : null,
    })
  }

  let taskId: number | null = null
  if (followUpDueAt) {
    const task = await createTask(
      db,
      orgId,
      {
        type: 'follow_up',
        title: `Seguimiento — ${visit.clientName}`,
        assigneeId: input.followUp?.assigneeId ?? visit.agentId ?? null,
        dueAt: followUpDueAt,
        contactId,
        leadId: visit.leadId,
        propertyId: visit.propertyId,
        propertyKind: visit.propertyKind as any,
        appointmentId: visitId,
      },
      // El seguimiento hereda la propiedad de una visita que ya ocurrió:
      // aunque esa propiedad esté hoy en la papelera, el seguimiento al
      // cliente sigue teniendo sentido (historia, no catálogo).
      { createdBy: opts.actorId ?? null, allowTrashedProperty: true },
    )
    taskId = task?.id ?? null
  }

  let offerId: number | null = null
  if (offerTerms) {
    const offer = await createOffer(
      db,
      orgId,
      {
        propertyId: visit.propertyId,
        propertyKind: visit.propertyKind,
        buyerContactId: contactId!,
        leadId: visit.leadId,
        commercialId: visit.agentId,
        ...offerTerms,
      },
      { createdBy: opts.actorId ?? null },
    )
    offerId = offer.id
  }

  return { ...fields, outcomeRecordedAt: nowTs, offerId, taskId, secondVisitId }
}

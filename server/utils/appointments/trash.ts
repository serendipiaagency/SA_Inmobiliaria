import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, isUniqueConstraintError, now } from '../db'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import { remarkRestoredFirstAppointment, unmarkTrashedFirstAppointment } from '../leads/sla'
import { hasOverlappingVisit } from './availability'
import { attachRelatedOffers } from './query'
import { APPOINTMENT_TRASH_REASON, trashedFromStatus } from '../../../utils/appointmentCatalog'

/**
 * Papelera de citas (cierre D3a). `visits.deleted_at` existía desde la
 * migración 0086 y todas las lecturas la filtraban, pero nada la escribía:
 * una cita creada por error (otro cliente, otro comercial, duplicada) sólo se
 * podía cancelar, y se quedaba para siempre en la agenda, en los contadores
 * y en la cronología como si hubiera existido.
 *
 * Eliminar NO borra la fila: pone `deleted_at`, y la cita desaparece de la
 * Lista, el Calendario, el iCal, los recordatorios, los huecos libres de la
 * reserva pública, el dashboard, la próxima acción y la «primera cita» del
 * lead, los tours, las fichas de contacto, lead y operación y las Domain
 * Tools. Su Activity se conserva y se añade APPOINTMENT_TRASHED.
 *
 * Una cita AGENDADA se guarda, además, cancelada con el motivo
 * `APPOINTMENT_TRASH_REASON` y `cancelled_at` = `deleted_at`: el índice único
 * `visits_agent_slot_unique` (migración 0050) sólo excluye las canceladas, y
 * sin esto la cita correcta no se podría volver a dar de alta a la misma
 * hora con el mismo comercial. Restaurarla la devuelve a «agendada» (si su
 * franja sigue libre) — `trashedFromStatus()` reconoce esa cancelación.
 *
 * Eliminar no avisa al cliente (es para lo que nunca debió existir). Por eso
 * se bloquea —409 con el motivo— lo que ya no es «un error interno»:
 *
 *  - una parada de un tour: se quita desde el tour (queda cancelada con su
 *    motivo), que mantiene la ruta y nunca se queda sin paradas activas;
 *  - una cita con el resultado de la visita anotado: ese resultado pudo crear
 *    una tarea, una segunda visita, una oferta o descartar una compatibilidad;
 *  - una cita realizada o en la que el cliente no se presentó: ya ocurrió, es
 *    historia y cuenta en el dashboard y en el rendimiento del comercial;
 *  - una cita agendada que el cliente ya conoce: la confirmó desde su enlace
 *    o le llegó un aviso real (email o WhatsApp entregado al proveedor). Hay
 *    que cancelarla, que sí le avisa;
 *  - una cita cuyo comprador tiene ofertas sobre ese inmueble: forma parte de
 *    la historia de esa negociación (la ficha de la cita las enseña).
 *
 * Tareas y notas que apuntan a la cita no la bloquean: siguen siendo trabajo
 * real y conservan su referencia como historia (igual que con una operación).
 */

type VisitRow = typeof schema.visits.$inferSelect

export interface TrashContext {
  actorId?: number | null
  actorType?: 'user' | 'ai'
}

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

/** Por qué esta cita NO puede ir a la papelera, o null si puede. */
export async function appointmentTrashBlocker(db: any, orgId: number, visit: VisitRow): Promise<string | null> {
  if (visit.tourId) {
    return `Es la parada ${(visit.tourStopOrder ?? 0) + 1} de un tour: quítala desde Visitas → Tours («Quitar»), donde queda cancelada con su motivo y la ruta se mantiene.`
  }
  if (visit.outcome || visit.outcomeRecordedAt) {
    return 'Tiene el resultado de la visita anotado (puede haber creado tareas, una segunda visita u ofertas): es historia de la agencia y no se elimina.'
  }
  if (visit.status === 'completed') {
    return 'La cita ya se realizó: es historia de la agencia y cuenta en el dashboard. Si se marcó como realizada por error, vuelve a ponerla como agendada y elimínala después.'
  }
  if (visit.status === 'no_show') {
    return 'Consta que el cliente no se presentó: es historia de la agencia. Si se marcó por error, vuelve a ponerla como agendada y elimínala después.'
  }
  if (visit.status === 'scheduled') {
    if (visit.confirmationStatus === 'confirmed') return 'El cliente ya la confirmó desde su enlace: cancélala (se le avisa) en lugar de eliminarla.'
    const [notified] = await db
      .select({ id: schema.appointmentNotifications.id })
      .from(schema.appointmentNotifications)
      .where(
        and(
          eq(schema.appointmentNotifications.organizationId, orgId),
          eq(schema.appointmentNotifications.visitId, visit.id),
          inArray(schema.appointmentNotifications.channel, ['email', 'whatsapp']),
          eq(schema.appointmentNotifications.delivered, 1),
        ),
      )
      .limit(1)
    if (notified) return 'Al cliente ya le llegó un aviso de esta cita (email o WhatsApp): cancélala para que reciba la cancelación; eliminarla le dejaría sin aviso.'
  }
  const offers = (await attachRelatedOffers(db, orgId, [visit])).get(visit.id) || []
  if (offers.length) {
    return `El comprador de esta cita tiene ${offers.length === 1 ? 'una oferta' : `${offers.length} ofertas`} sobre este inmueble (${offers.map((o) => `#${o.id}`).join(', ')}): la cita forma parte de esa negociación. Si ya no se va a hacer, cancélala.`
  }
  return null
}

/** El contacto de la cita: el suyo o, si no tiene, el de su lead (para que el evento salga en la cronología de la persona). */
async function effectiveContactId(db: any, orgId: number, visit: VisitRow): Promise<number | null> {
  if (visit.contactId) return visit.contactId
  if (!visit.leadId) return null
  const [lead] = await db
    .select({ contactId: schema.leads.contactId })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, visit.leadId), eq(schema.leads.organizationId, orgId)))
    .limit(1)
  return lead?.contactId ?? null
}

async function recordTrashActivity(db: any, orgId: number, visit: VisitRow, eventType: 'APPOINTMENT_TRASHED' | 'APPOINTMENT_RESTORED', status: string, ctx: TrashContext) {
  await recordActivity(db, orgId, {
    eventType,
    entityType: 'visit',
    entityId: visit.id,
    appointmentId: visit.id,
    leadId: visit.leadId,
    contactId: await effectiveContactId(db, orgId, visit),
    propertyId: visit.propertyId,
    propertyKind: (visit.propertyKind as any) ?? null,
    actorType: ctx.actorType ?? (ctx.actorId ? 'user' : 'system'),
    actorId: ctx.actorId ?? null,
    metadata: { status, scheduledAt: visit.scheduledAt, type: visit.type },
  })
}

/**
 * Manda una cita a la papelera. Otra agencia, inexistente o ya en la
 * papelera: 404. Bloqueada (ver arriba): 409 con el motivo. Recalcula la
 * próxima acción y la «primera cita» de su lead.
 */
export async function trashAppointment(db: any, orgId: number, visitId: number, ctx: TrashContext = {}): Promise<VisitRow> {
  if (!Number.isInteger(visitId) || visitId <= 0) fail(400, 'Invalid id')
  const [visit]: VisitRow[] = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId), isNull(schema.visits.deletedAt)))
    .limit(1)
  if (!visit) fail(404, 'Visita no encontrada')

  const blocker = await appointmentTrashBlocker(db, orgId, visit)
  if (blocker) fail(409, blocker)

  const nowTs = now()
  const patch: Partial<VisitRow> = { deletedAt: nowTs, updatedAt: nowTs }
  // Libera el hueco (índice único parcial): ver el comentario del fichero.
  if (visit.status === 'scheduled') Object.assign(patch, { status: 'cancelled', cancellationReason: APPOINTMENT_TRASH_REASON, cancelledAt: nowTs })
  await db.update(schema.visits).set(patch).where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))

  await recordTrashActivity(db, orgId, visit, 'APPOINTMENT_TRASHED', visit.status, ctx)
  if (visit.leadId) {
    await syncLeadNextAction(db, orgId, visit.leadId)
    await unmarkTrashedFirstAppointment(db, orgId, visit.leadId)
  }
  return { ...visit, ...patch }
}

/**
 * Saca una cita de la papelera y la devuelve como estaba: la que estaba
 * agendada vuelve a «agendada» — si su comercial sigue libre a esa hora; si
 * no, 409 y se queda en la papelera — y la que ya estaba cancelada, cancelada
 * con su motivo. Otra agencia o inexistente: 404; una que no está en la
 * papelera se devuelve sin tocar (restaurar dos veces no deja dos eventos).
 * Su inmueble no se vuelve a juzgar: la cita ya existía.
 */
export async function restoreAppointment(db: any, orgId: number, visitId: number, ctx: TrashContext = {}): Promise<VisitRow> {
  if (!Number.isInteger(visitId) || visitId <= 0) fail(400, 'Invalid id')
  const [visit]: VisitRow[] = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
    .limit(1)
  if (!visit) fail(404, 'Visita no encontrada')
  if (!visit.deletedAt) return visit

  const previousStatus = trashedFromStatus(visit)
  const reschedule = previousStatus === 'scheduled' && visit.status === 'cancelled'
  const busy = `No se puede restaurar: ${visit.agentName || 'el comercial'} ya tiene otra cita en esa franja (${visit.scheduledAt.slice(0, 16)}). Mueve o cancela esa cita y vuelve a intentarlo.`
  const nowTs = now()
  const patch: Partial<VisitRow> = { deletedAt: null, updatedAt: nowTs }
  if (reschedule) {
    if (visit.agentId && (await hasOverlappingVisit(db, orgId, visit.agentId, visit.scheduledAt, visit.endsAt || visit.scheduledAt, visit.id))) fail(409, busy)
    Object.assign(patch, { status: 'scheduled', cancellationReason: null, cancelledAt: null })
  }
  try {
    await db.update(schema.visits).set(patch).where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
  } catch (e: any) {
    // visits_agent_slot_unique: otra cita ocupó exactamente ese inicio mientras tanto.
    if (isUniqueConstraintError(e)) fail(409, busy)
    throw e
  }

  await recordTrashActivity(db, orgId, visit, 'APPOINTMENT_RESTORED', previousStatus, ctx)
  if (visit.leadId) {
    await syncLeadNextAction(db, orgId, visit.leadId)
    await remarkRestoredFirstAppointment(db, orgId, visit.leadId, visit.createdAt)
  }
  return { ...visit, ...patch }
}

import { and, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, isUniqueConstraintError, now } from '../db'
import { hasOverlappingVisit } from './availability'
import { notifyAppointment } from './notifications'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import { generateVideoLink } from './videoLink'
import { CLIENT_FACING_TYPES, INTERNAL_CONFIRMATION_STATUSES } from '../../../utils/appointmentCatalog'
import {
  fail,
  initialReminderStatus,
  loadAgent,
  loadContact,
  loadLead,
  loadOffice,
  minutesBetween,
  normalizeDateTime,
  optionalId,
  optionalText,
  parseAppointmentStatus,
  parseAppointmentType,
  parsePropertyKind,
  parseTimezone,
  resolveChannel,
  resolveEnd,
  resolveLiveProperty,
} from './fields'

/**
 * Cambiar una cita existente (FASES 17 y 20): confirmar, cancelar (con
 * motivo), marcar realizada o no presentada, reprogramar con inicio y fin
 * libres, reasignar, reclasificar, y editar TODOS sus campos — inmueble (de
 * los dos catálogos), lead, contacto, oficina, zona horaria, punto de
 * encuentro, notas, notas internas, datos del cliente y la confirmación
 * interna — con la comprobación real de solapes, Activity, próxima acción
 * del lead y aviso al cliente.
 *
 * Vive aquí (FASE 31) para que las Domain Tools (`reschedule_viewing`,
 * `cancel_viewing`) usen exactamente las mismas reglas que el panel. La
 * identidad y el historial de la cita se conservan: reprogramar mueve la
 * misma fila, cancelar cambia el estado (nunca se borra).
 *
 * Cada referencia nueva se busca dentro de la agencia (404 si es ajena); un
 * inmueble nuevo, además, fuera de la papelera (422). Conservar el inmueble
 * que ya tenía no se revalida: la cita es historia.
 */
export interface UpdateAppointmentInput {
  status?: string
  /** Obligatorio al cancelar. */
  cancellationReason?: string | null
  scheduledAt?: string
  /** Fin libre; alternativa a `durationMinutes`. */
  endsAt?: string | null
  agentId?: number | null
  /** FASE 17, migración 0072: reclasificar una cita mal etiquetada. */
  type?: string
  channel?: string
  /** FASE 20: "resize" en Calendar — cambiar la duración sin mover la hora de inicio ni el comercial. */
  durationMinutes?: number
  propertyId?: number | null
  propertyKind?: string | null
  leadId?: number | null
  contactId?: number | null
  officeId?: number | null
  timezone?: string | null
  meetingPoint?: string | null
  notes?: string | null
  internalNotes?: string | null
  /** Sólo `pending` o `confirmed_internal`: la confirmación del cliente la da él desde su enlace. */
  confirmationStatus?: string
  clientName?: string
  clientEmail?: string | null
  clientPhone?: string | null
}

export interface UpdateAppointmentContext {
  userId: number | null
  actorType?: 'user' | 'ai'
  env: Record<string, any>
  requestId?: string | null
  publicOrigin?: string | null
  /** Contexto extra para Activity (p. ej. `{ tourId, removedFromTour }` al quitar una parada de un tour). */
  activityMetadata?: Record<string, unknown> | null
}

export async function updateAppointment(db: any, orgId: number, visitId: number, body: UpdateAppointmentInput, ctx: UpdateAppointmentContext) {
  if (!Number.isFinite(visitId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  body = body || {}
  // Una cita de la papelera (cierre D3a) no se edita: primero se restaura.
  const rows = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId), isNull(schema.visits.deletedAt)))
    .limit(1)
  const visit = rows[0]
  if (!visit) throw createError({ statusCode: 404, statusMessage: 'Visita no encontrada' })

  const patch: Record<string, any> = {}
  const nowTs = now()

  // --- Tipo y canal ---------------------------------------------------------
  const nextType = body.type !== undefined ? parseAppointmentType(body.type) : visit.type
  if (nextType !== visit.type) patch.type = nextType
  if (body.channel !== undefined || (patch.type && nextType === 'video_call' && visit.channel !== 'video')) {
    const channel = resolveChannel(nextType, body.channel !== undefined ? body.channel : nextType === 'video_call' ? 'video' : visit.channel)
    if (channel !== visit.channel) patch.channel = channel
  } else if (patch.type) {
    resolveChannel(nextType, visit.channel)
  }
  const finalChannel = patch.channel ?? visit.channel
  if (finalChannel === 'video' && !visit.videoLink) patch.videoLink = generateVideoLink()

  // --- Estado y motivo de cancelación --------------------------------------
  const nextStatus = body.status !== undefined ? parseAppointmentStatus(body.status) : visit.status
  if (nextStatus !== visit.status) patch.status = nextStatus
  const reason = optionalText(body.cancellationReason, 'Motivo de cancelación', 500)
  if (nextStatus === 'cancelled') {
    if (visit.status !== 'cancelled') {
      if (!reason) fail(422, 'Indica el motivo de la cancelación')
      patch.cancellationReason = reason
      patch.cancelledAt = nowTs
    } else if (reason) {
      patch.cancellationReason = reason
    }
  } else {
    if (reason) fail(422, 'El motivo de cancelación sólo se guarda al cancelar la cita')
    if (visit.status === 'cancelled') {
      // Reactivar una cita cancelada: deja de tener motivo de cancelación.
      patch.cancellationReason = null
      patch.cancelledAt = null
    }
  }

  // --- Cliente --------------------------------------------------------------
  if (body.clientName !== undefined) {
    const name = String(body.clientName || '').trim()
    if (!name) fail(422, 'El nombre del cliente es obligatorio')
    if (name !== visit.clientName) patch.clientName = name
  }
  const email = optionalText(body.clientEmail, 'Email', 200)
  if (email !== undefined && email !== visit.clientEmail) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'El email no tiene un formato válido')
    patch.clientEmail = email
  }
  const phone = optionalText(body.clientPhone, 'Teléfono', 50)
  if (phone !== undefined && phone !== visit.clientPhone) patch.clientPhone = phone

  // --- Lead y contacto ------------------------------------------------------
  const leadId = optionalId(body.leadId, 'Lead')
  const contactId = optionalId(body.contactId, 'Contacto')
  let leadContactId: number | null | undefined
  if (leadId !== undefined && leadId !== visit.leadId) {
    if (leadId) {
      const lead = await loadLead(db, orgId, leadId)
      leadContactId = lead.contactId
      if (contactId === undefined && lead.contactId) patch.contactId = lead.contactId
    }
    patch.leadId = leadId
  }
  if (contactId !== undefined && contactId !== visit.contactId) {
    if (contactId) await loadContact(db, orgId, contactId)
    patch.contactId = contactId
  }
  const finalLeadId = patch.leadId !== undefined ? patch.leadId : visit.leadId
  const finalContactId = patch.contactId !== undefined ? patch.contactId : visit.contactId
  if (finalLeadId && finalContactId && (patch.leadId !== undefined || patch.contactId !== undefined)) {
    if (leadContactId === undefined) leadContactId = (await loadLead(db, orgId, finalLeadId).catch(() => null))?.contactId ?? null
    if (leadContactId && leadContactId !== finalContactId) fail(422, 'El contacto no coincide con la persona del lead elegido')
  }

  // --- Oficina y zona horaria -----------------------------------------------
  const officeId = optionalId(body.officeId, 'Oficina')
  if (officeId !== undefined && officeId !== visit.officeId) {
    if (officeId) await loadOffice(db, orgId, officeId)
    patch.officeId = officeId
  }
  const timezone = parseTimezone(body.timezone)
  if (timezone !== undefined && timezone !== visit.timezone) patch.timezone = timezone

  // --- Inmueble (los dos catálogos) -----------------------------------------
  if (body.propertyId !== undefined || body.propertyKind !== undefined) {
    const nextPropertyId = body.propertyId !== undefined ? optionalId(body.propertyId, 'Inmueble') : visit.propertyId
    if (!nextPropertyId) {
      if (visit.propertyId) Object.assign(patch, { propertyId: null, propertyKind: null, propertyName: null })
    } else {
      const nextKind = parsePropertyKind(body.propertyKind ?? visit.propertyKind ?? 'developer')
      if (nextPropertyId !== visit.propertyId || nextKind !== visit.propertyKind) {
        patch.propertyName = await resolveLiveProperty(db, orgId, nextKind, nextPropertyId)
        patch.propertyId = nextPropertyId
        patch.propertyKind = nextKind
      }
    }
  }

  // --- Textos ---------------------------------------------------------------
  for (const [key, label, max] of [
    ['meetingPoint', 'Punto de encuentro', 300],
    ['notes', 'Notas', 5000],
    ['internalNotes', 'Notas internas', 5000],
  ] as const) {
    const value = optionalText((body as any)[key], label, max)
    if (value !== undefined && value !== visit[key]) patch[key] = value
  }

  // --- Confirmación interna -------------------------------------------------
  if (body.confirmationStatus !== undefined) {
    if (!INTERNAL_CONFIRMATION_STATUSES.includes(String(body.confirmationStatus))) fail(422, 'La confirmación del cliente sólo la puede dar el cliente desde su enlace')
    if (body.confirmationStatus !== visit.confirmationStatus) {
      patch.confirmationStatus = body.confirmationStatus
      patch.confirmedAt = body.confirmationStatus === 'confirmed_internal' ? nowTs : null
    }
  }

  // --- Hora, duración y comercial -------------------------------------------
  const nextScheduledAt = body.scheduledAt !== undefined ? normalizeDateTime(body.scheduledAt, 'Inicio') : visit.scheduledAt
  const startChanged = nextScheduledAt !== visit.scheduledAt
  const agentChanged = body.agentId !== undefined && (body.agentId || null) !== visit.agentId
  const endGiven = body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== ''
  const durationGiven = body.durationMinutes !== undefined && body.durationMinutes !== null
  const currentDuration = visit.endsAt ? minutesBetween(visit.scheduledAt, visit.endsAt) : visit.durationMinutes
  let nextAgentId = visit.agentId as number | null
  let fallbackDuration = currentDuration
  if (agentChanged) {
    if (body.agentId) {
      const agent = await loadAgent(db, orgId, Number(body.agentId), 'Agente no encontrado')
      patch.agentId = agent.id
      patch.agentName = agent.name
      nextAgentId = agent.id
      // Cambiar de comercial reasigna a su duración por defecto, salvo que este mismo cambio fije un fin o una duración explícitos.
      fallbackDuration = agent.slotDurationMinutes
    } else {
      patch.agentId = null
      patch.agentName = null
      nextAgentId = null
    }
  }
  const timing = startChanged || agentChanged || endGiven || durationGiven
  if (timing) {
    const { endsAt, durationMinutes } = resolveEnd(nextScheduledAt, { endsAt: body.endsAt, durationMinutes: body.durationMinutes }, fallbackDuration)
    const timeChanged = startChanged || endsAt !== visit.endsAt || durationMinutes !== visit.durationMinutes
    if (timeChanged || agentChanged) {
      patch.scheduledAt = nextScheduledAt
      patch.endsAt = endsAt
      patch.durationMinutes = durationMinutes
      // Un cambio de hora, de duración o de comercial invalida la confirmación
      // que ya hubiera (del cliente o de la agencia), salvo que este mismo
      // cambio la vuelva a dar, y al mover el inicio los recordatorios vuelven a empezar.
      if (visit.confirmationStatus !== 'pending' && body.confirmationStatus === undefined) {
        patch.confirmationStatus = 'pending'
        patch.confirmedAt = null
      }
    }
    if (startChanged) {
      patch.reminder24hSentAt = null
      patch.reminder1hSentAt = null
    }
  }

  // Solapes: si cambia la franja o el comercial, o si se reactiva una cita cancelada.
  const finalStatus = patch.status ?? visit.status
  const finalStart = patch.scheduledAt ?? visit.scheduledAt
  const finalEnd = patch.endsAt ?? visit.endsAt ?? visit.scheduledAt
  const reactivated = visit.status === 'cancelled' && finalStatus !== 'cancelled'
  if (nextAgentId && finalStatus !== 'cancelled' && (patch.scheduledAt !== undefined || reactivated)) {
    if (await hasOverlappingVisit(db, orgId, nextAgentId, finalStart, finalEnd, visitId)) fail(409, 'Ese agente ya tiene otra cita en ese horario.')
  }

  // Recordatorio: sin email ni teléfono no hay a quién recordar; al mover el inicio, vuelve a estar pendiente.
  const finalEmail = patch.clientEmail !== undefined ? patch.clientEmail : visit.clientEmail
  const finalPhone = patch.clientPhone !== undefined ? patch.clientPhone : visit.clientPhone
  if (CLIENT_FACING_TYPES.includes(nextType) && !finalEmail && !finalPhone && (patch.clientEmail !== undefined || patch.clientPhone !== undefined || patch.type)) {
    fail(422, 'email o teléfono es obligatorio para avisar al cliente')
  }
  if (startChanged || patch.clientEmail !== undefined || patch.clientPhone !== undefined) {
    const sent = !startChanged && (visit.reminder24hSentAt || visit.reminder1hSentAt)
    const nextReminder = sent ? visit.reminderStatus : initialReminderStatus(finalEmail, finalPhone)
    if (nextReminder !== visit.reminderStatus) patch.reminderStatus = nextReminder
  }

  if (!Object.keys(patch).filter((k) => k !== 'videoLink').length) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })
  patch.updatedAt = nowTs

  // hasOverlappingVisit() above is a read-then-write check, same shape as
  // the public booking endpoint's — the real guard against two admins
  // reassigning into the same slot concurrently is visits_agent_slot_unique
  // (migration 0050), whose violation is translated into the same 409.
  try {
    await db.update(schema.visits).set(patch).where(and(eq(schema.visits.id, visitId), eq(schema.visits.organizationId, orgId)))
  } catch (e: any) {
    if (isUniqueConstraintError(e)) {
      throw createError({ statusCode: 409, statusMessage: 'Ese agente ya tiene otra cita en ese horario.' })
    }
    throw e
  }

  const activityLeadId = finalLeadId
  const activityContactId =
    finalContactId ?? (activityLeadId ? ((await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(and(eq(schema.leads.id, activityLeadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]?.contactId ?? null) : null)
  const activityBase = {
    entityType: 'visit' as const,
    entityId: visitId,
    appointmentId: visitId,
    leadId: activityLeadId,
    contactId: activityContactId,
    propertyId: patch.propertyId !== undefined ? patch.propertyId : visit.propertyId,
    propertyKind: (patch.propertyKind !== undefined ? patch.propertyKind : visit.propertyKind) as any,
    actorType: ctx.actorType ?? ('user' as const),
    actorId: ctx.userId,
  }
  const extra = ctx.activityMetadata || {}
  const withExtra = (metadata: Record<string, unknown> | null) => (metadata || Object.keys(extra).length ? { ...(metadata || {}), ...extra } : null)
  if (patch.status === 'cancelled') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'APPOINTMENT_CANCELLED', metadata: withExtra({ reason: patch.cancellationReason ?? null }) })
  } else if (patch.status === 'completed' && nextType === 'property_viewing') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'VIEWING_COMPLETED', metadata: withExtra(null) })
  } else if (patch.status === 'no_show' && nextType === 'property_viewing') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'VIEWING_NO_SHOW', metadata: withExtra(null) })
  }
  if (patch.scheduledAt && patch.scheduledAt !== visit.scheduledAt && finalStatus !== 'cancelled') {
    await recordActivity(db, orgId, { ...activityBase, eventType: 'APPOINTMENT_RESCHEDULED', metadata: withExtra({ from: visit.scheduledAt, to: patch.scheduledAt }) })
  }
  // Cancelar, completar, mover o cambiar de lead la cita puede cambiar cuál es la próxima acción del lead (FASE 22).
  const leadsToSync = new Set<number>()
  if (patch.status !== undefined || patch.scheduledAt !== undefined || patch.type !== undefined || patch.leadId !== undefined) {
    if (visit.leadId) leadsToSync.add(visit.leadId)
    if (finalLeadId) leadsToSync.add(finalLeadId)
  }
  for (const id of leadsToSync) await syncLeadNextAction(db, orgId, id)

  try {
    if (patch.status === 'cancelled') {
      await notifyAppointment(db, ctx.env, {
        organizationId: orgId,
        visitId,
        type: 'cancelled',
        recipientEmail: finalEmail,
        recipientPhone: finalPhone,
        message: `Tu cita del ${visit.scheduledAt} con ${visit.agentName || 'tu agente'} ha sido cancelada.`,
        scheduledAt: visit.scheduledAt,
        agentName: visit.agentName,
        requestId: ctx.requestId ?? null,
        publicOrigin: ctx.publicOrigin ?? null,
      })
    } else if (patch.scheduledAt && patch.scheduledAt !== visit.scheduledAt && finalStatus === 'scheduled') {
      await notifyAppointment(db, ctx.env, {
        organizationId: orgId,
        visitId,
        type: 'rescheduled',
        recipientEmail: finalEmail,
        recipientPhone: finalPhone,
        message: `Tu cita ha sido reprogramada al ${patch.scheduledAt} con ${patch.agentName || visit.agentName || 'tu agente'}.`,
        scheduledAt: patch.scheduledAt,
        agentName: patch.agentName || visit.agentName,
        requestId: ctx.requestId ?? null,
        publicOrigin: ctx.publicOrigin ?? null,
      })
    }
  } catch {
    // El cambio ya quedó guardado — un fallo al notificar nunca debe deshacerlo.
  }

  return { before: visit, patch }
}

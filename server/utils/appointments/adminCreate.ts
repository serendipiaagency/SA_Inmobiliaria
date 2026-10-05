import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now, isUniqueConstraintError } from '../db'
import { hasOverlappingVisit } from './availability'
import { generateManagementToken } from './managementToken'
import { generateVideoLink } from './videoLink'
import type { PropertyKind } from '../matching/service'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import { markFirstAppointment } from '../leads/sla'
import { CLIENT_FACING_TYPES, INTERNAL_CONFIRMATION_STATUSES } from '../../../utils/appointmentCatalog'
import {
  assertDealInOrg,
  fail,
  initialReminderStatus,
  loadAgent,
  loadContact,
  loadLead,
  loadOffice,
  normalizeDateTime,
  optionalText,
  parseAppointmentType,
  parsePropertyKind,
  parseTimezone,
  resolveChannel,
  resolveEnd,
  resolveLiveProperty,
  type ContactRef,
  type LeadRef,
} from './fields'

export interface CreateAdminAppointmentInput {
  /** Nombre del cliente (o título de la cita). Sin él, el del contacto o el del lead. */
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  agentId: number
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  scheduledAt: string
  /** Fin libre; si no, `durationMinutes`; si no, la franja del comercial. */
  endsAt?: string | null
  durationMinutes?: number | null
  channel?: string
  type?: string
  leadId?: number | null
  contactId?: number | null
  officeId?: number | null
  timezone?: string | null
  meetingPoint?: string | null
  notes?: string | null
  internalNotes?: string | null
  /** Sólo la confirmación interna (`confirmed_internal`) o `pending`: la del cliente la da él. */
  confirmationStatus?: string | null
  /** FASE 24: cuando esta cita es de un Deal (notaría/firma) — aparece en Calendar automáticamente, sin mecanismo aparte. */
  dealId?: number | null
  createdBy?: number | null
}

/**
 * Lead y contacto de una cita, coherentes entre sí: si el lead ya tiene a su
 * persona identificada y se elige otro contacto distinto, es un error (la
 * cita quedaría colgando de dos personas). Sin contacto explícito, la cita
 * hereda el del lead.
 */
export async function resolveLeadAndContact(db: any, orgId: number, leadId: number | null | undefined, contactId: number | null | undefined): Promise<{ lead: LeadRef | null; contact: ContactRef | null }> {
  const lead = leadId ? await loadLead(db, orgId, leadId) : null
  if (lead?.contactId && contactId && lead.contactId !== contactId) fail(422, 'El contacto no coincide con la persona del lead elegido')
  const contact = contactId ? await loadContact(db, orgId, contactId) : lead?.contactId ? await loadContact(db, orgId, lead.contactId).catch(() => null) : null
  return { lead, contact }
}

/**
 * Crea una única cita desde el panel (Calendar "crear desde hueco", FASE 20;
 * todos los tipos y campos de FASE 17) — no un tour de una sola parada.
 * Comercial, lead, contacto, oficina, operación e inmueble se buscan dentro
 * de la agencia (404 si son ajenos); el inmueble, en su catálogo y fuera de
 * la papelera; y la franja se comprueba contra la agenda real del comercial.
 */
export async function createAdminAppointment(db: any, orgId: number, input: CreateAdminAppointmentInput) {
  const type = input.type === undefined || input.type === null || input.type === '' ? 'property_viewing' : parseAppointmentType(input.type)
  const channel = resolveChannel(type, input.channel)
  const scheduledAt = normalizeDateTime(input.scheduledAt, 'Inicio')

  const agent = await loadAgent(db, orgId, input.agentId)
  const { lead, contact } = await resolveLeadAndContact(db, orgId, input.leadId, input.contactId)
  if (input.dealId) await assertDealInOrg(db, orgId, input.dealId)

  const clientName = String(input.clientName || '').trim() || contact?.name || lead?.name || ''
  if (!clientName) fail(422, 'El nombre del cliente es obligatorio (clientName)')
  const clientEmail = String(input.clientEmail || '').trim() || contact?.email || lead?.email || null
  const clientPhone = String(input.clientPhone || '').trim() || contact?.phone || lead?.phone || null
  if (CLIENT_FACING_TYPES.includes(type) && !clientEmail && !clientPhone) fail(422, 'email o teléfono es obligatorio para avisar al cliente')

  const officeId = input.officeId ?? agent.officeId ?? null
  const office = officeId ? await loadOffice(db, orgId, officeId) : null
  const tz = parseTimezone(input.timezone)
  const timezone = tz ?? office?.timezone ?? null

  let propertyName: string | null = null
  let propertyKind: PropertyKind | null = null
  if (input.propertyId) {
    propertyKind = parsePropertyKind(input.propertyKind || 'developer')
    // Una cita nueva no se programa sobre una propiedad en la papelera.
    propertyName = await resolveLiveProperty(db, orgId, propertyKind, input.propertyId)
  }

  const confirmation = input.confirmationStatus || 'pending'
  if (!INTERNAL_CONFIRMATION_STATUSES.includes(confirmation)) fail(422, 'La confirmación del cliente sólo la puede dar el cliente desde su enlace')

  const meetingPoint = optionalText(input.meetingPoint, 'Punto de encuentro', 300) ?? null
  const notes = optionalText(input.notes, 'Notas') ?? null
  const internalNotes = optionalText(input.internalNotes, 'Notas internas') ?? null

  const { endsAt, durationMinutes } = resolveEnd(scheduledAt, input, agent.slotDurationMinutes)
  if (await hasOverlappingVisit(db, orgId, agent.id, scheduledAt, endsAt)) {
    throw createError({ statusCode: 409, statusMessage: `${agent.name} ya tiene otra cita a esa hora` })
  }

  const nowTs = now()
  let visit: any
  try {
    ;[visit] = await db
      .insert(schema.visits)
      .values({
        organizationId: orgId,
        clientName,
        clientEmail,
        clientPhone,
        propertyId: input.propertyId || null,
        propertyName,
        propertyKind,
        agentId: agent.id,
        agentName: agent.name,
        scheduledAt,
        durationMinutes,
        endsAt,
        status: 'scheduled',
        channel,
        type,
        confirmationStatus: confirmation,
        confirmedAt: confirmation === 'confirmed_internal' ? nowTs : null,
        leadId: lead?.id ?? null,
        contactId: contact?.id ?? null,
        officeId,
        timezone,
        meetingPoint,
        notes,
        internalNotes,
        reminderStatus: initialReminderStatus(clientEmail, clientPhone),
        videoLink: channel === 'video' ? generateVideoLink() : null,
        dealId: input.dealId || null,
        managementToken: generateManagementToken(),
        createdBy: input.createdBy ?? null,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning()
  } catch (e: any) {
    // visits_agent_slot_unique (migración 0050): dos altas simultáneas en el mismo hueco.
    if (isUniqueConstraintError(e)) throw createError({ statusCode: 409, statusMessage: `${agent.name} ya tiene otra cita a esa hora` })
    throw e
  }

  await recordActivity(db, orgId, {
    eventType: 'APPOINTMENT_CREATED',
    entityType: 'visit',
    entityId: visit.id,
    appointmentId: visit.id,
    leadId: lead?.id ?? null,
    contactId: contact?.id ?? lead?.contactId ?? null,
    propertyId: input.propertyId || null,
    propertyKind,
    actorType: 'user',
    actorId: input.createdBy ?? null,
    metadata: { channel, type },
  })
  if (lead) {
    await syncLeadNextAction(db, orgId, lead.id)
    await markFirstAppointment(db, orgId, lead.id)
  }

  return visit
}

/** 404 si el lead no existe en esta agencia — mismo trato que cualquier referencia ajena. */
export async function assertLeadInOrg(db: any, orgId: number, leadId: number) {
  await loadLead(db, orgId, leadId)
}

import { createError } from 'h3'
import * as schema from '../../db/schema'
import { and, eq } from 'drizzle-orm'
import { now } from '../db'
import { hasOverlappingVisit, shiftDateTime } from './availability'
import { generateManagementToken } from './managementToken'
import type { PropertyKind } from '../matching/service'
import { recordActivity } from '../activity/service'

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const VALID_CHANNELS = ['in_person', 'video', 'phone'] as const
const VALID_TYPES = ['property_viewing', 'call', 'other'] as const

export interface CreateAdminAppointmentInput {
  clientName: string
  clientEmail?: string | null
  clientPhone?: string | null
  agentId: number
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  scheduledAt: string
  channel?: string
  type?: string
  leadId?: number | null
}

/**
 * Crea una única cita desde el panel (Calendar "crear desde hueco", FASE 20)
 * — no un tour de una sola parada. Misma validación que `createTour()` para
 * cada parada (comercial real, inmueble real si lo hay, solape contra la
 * agenda real), pero sin cabecera de tour: es exactamente lo que ya hacía
 * POST /api/public/agents/:slug/book, sólo que iniciado por un admin en vez
 * de por el propio cliente, así que también admite `agentId` explícito y
 * cualquiera de los dos catálogos de inmueble.
 */
export async function createAdminAppointment(db: any, orgId: number, input: CreateAdminAppointmentInput) {
  const clientName = input.clientName.trim()
  if (!clientName) throw createError({ statusCode: 422, statusMessage: 'clientName es obligatorio' })
  if (!input.clientEmail && !input.clientPhone) throw createError({ statusCode: 422, statusMessage: 'email o teléfono es obligatorio' })
  if (!DATETIME_RE.test(input.scheduledAt)) throw createError({ statusCode: 422, statusMessage: 'scheduledAt no válido (YYYY-MM-DD HH:MM:SS)' })

  const agentRows = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, input.agentId), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  const agent = agentRows[0]
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado' })

  let propertyName: string | null = null
  const propertyKind: PropertyKind | null = input.propertyId ? input.propertyKind || 'developer' : null
  if (input.propertyId) {
    if (propertyKind === 'agent') {
      const propRows = await db
        .select({ reference: schema.agentProperties.reference, street: schema.agentProperties.street, streetNumber: schema.agentProperties.streetNumber })
        .from(schema.agentProperties)
        .where(and(eq(schema.agentProperties.id, input.propertyId), eq(schema.agentProperties.organizationId, orgId)))
        .limit(1)
      if (!propRows[0]) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })
      propertyName = propRows[0].reference || [propRows[0].street, propRows[0].streetNumber].filter(Boolean).join(' ') || null
    } else {
      const propRows = await db
        .select({ name: schema.developerProperties.name })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, input.propertyId), eq(schema.developerProperties.organizationId, orgId)))
        .limit(1)
      if (!propRows[0]) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })
      propertyName = propRows[0].name
    }
  }

  const channel = (VALID_CHANNELS as readonly string[]).includes(String(input.channel)) ? input.channel! : 'in_person'
  const type = (VALID_TYPES as readonly string[]).includes(String(input.type)) ? input.type! : 'property_viewing'
  const endsAt = shiftDateTime(input.scheduledAt, agent.slotDurationMinutes)

  if (await hasOverlappingVisit(db, orgId, agent.id, input.scheduledAt, endsAt)) {
    throw createError({ statusCode: 409, statusMessage: `${agent.name} ya tiene otra cita a esa hora` })
  }

  const nowTs = now()
  const [visit] = await db
    .insert(schema.visits)
    .values({
      organizationId: orgId,
      clientName,
      clientEmail: input.clientEmail || null,
      clientPhone: input.clientPhone || null,
      propertyId: input.propertyId || null,
      propertyName,
      propertyKind,
      agentId: agent.id,
      agentName: agent.name,
      scheduledAt: input.scheduledAt,
      durationMinutes: agent.slotDurationMinutes,
      endsAt,
      status: 'scheduled',
      channel,
      type,
      leadId: input.leadId || null,
      managementToken: generateManagementToken(),
      createdAt: nowTs,
    })
    .returning()

  let contactId: number | null = null
  if (input.leadId) {
    const leadRows = await db.select({ contactId: schema.leads.contactId }).from(schema.leads).where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.organizationId, orgId))).limit(1)
    contactId = leadRows[0]?.contactId ?? null
  }
  await recordActivity(db, orgId, {
    eventType: 'APPOINTMENT_CREATED',
    entityType: 'visit',
    entityId: visit.id,
    appointmentId: visit.id,
    leadId: input.leadId || null,
    contactId,
    propertyId: input.propertyId || null,
    propertyKind,
    actorType: 'user',
    metadata: { channel, type },
  })

  return visit
}

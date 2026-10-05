import { and, eq, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import type { PropertyKind } from '../matching/service'
import { assertLiveProperty } from '../properties/trash'
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_MAX_MINUTES,
  APPOINTMENT_MIN_MINUTES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  defaultChannelFor,
  isValidTimeZone,
} from '../../../utils/appointmentCatalog'

/**
 * Validación común de una cita (FASE 17): la usan el alta suelta
 * (adminCreate.ts), la edición (update.ts), los tours (tours.ts) y el
 * resultado de visita (outcome.ts), para que «qué es una cita válida» se
 * escriba una sola vez.
 *
 * Toda referencia (comercial, lead, contacto, oficina, inmueble, operación)
 * se busca DENTRO de la organización: una de otra agencia responde 404,
 * igual que una que no existe. Un inmueble nuevo en la cita, además, tiene
 * que estar fuera de la papelera (422).
 */

export function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

/**
 * Normaliza una fecha y hora a 'YYYY-MM-DD HH:MM:SS' (hora de pared, ver
 * timezone.ts). Acepta también la forma del input `datetime-local`
 * ('YYYY-MM-DDTHH:MM') y comprueba que la fecha exista de verdad.
 */
export function normalizeDateTime(value: unknown, label = 'Fecha y hora'): string {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim()) : null
  if (!m) fail(422, `${label}: fecha y hora no válidas (YYYY-MM-DD HH:MM:SS)`)
  const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)]
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    fail(422, `${label}: esa fecha no existe`)
  }
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`
}

/** Minutos de `start` a `end` (dos horas de pared normalizadas). */
export function minutesBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end.replace(' ', 'T')}Z`) - Date.parse(`${start.replace(' ', 'T')}Z`)) / 60_000)
}

/** Desplaza una hora de pared 'YYYY-MM-DD HH:MM:SS' `minutes` minutos. */
export function addMinutes(dateTime: string, minutes: number): string {
  return new Date(Date.parse(`${dateTime.replace(' ', 'T')}Z`) + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19)
}

function assertDuration(minutes: number, label = 'La cita'): number {
  if (!Number.isInteger(minutes) || minutes < APPOINTMENT_MIN_MINUTES || minutes > APPOINTMENT_MAX_MINUTES) {
    fail(422, `${label} debe durar entre ${APPOINTMENT_MIN_MINUTES} minutos y ${APPOINTMENT_MAX_MINUTES / 60} horas (durationMinutes entre ${APPOINTMENT_MIN_MINUTES} y ${APPOINTMENT_MAX_MINUTES})`)
  }
  return minutes
}

/**
 * Fin de la cita: un `endsAt` explícito manda; si no, `durationMinutes`; si
 * no, la duración por defecto (la franja del comercial). Inicio y fin son
 * libres, pero el fin tiene que ir después del inicio y la duración quedar
 * entre 5 minutos y 12 horas.
 */
export function resolveEnd(
  scheduledAt: string,
  input: { endsAt?: unknown; durationMinutes?: unknown },
  fallbackMinutes: number,
  label = 'La cita',
): { endsAt: string; durationMinutes: number } {
  const hasEnd = input.endsAt !== undefined && input.endsAt !== null && input.endsAt !== ''
  const hasDuration = input.durationMinutes !== undefined && input.durationMinutes !== null && input.durationMinutes !== ''
  if (hasEnd) {
    const endsAt = normalizeDateTime(input.endsAt, `${label}: fin`)
    const minutes = minutesBetween(scheduledAt, endsAt)
    if (minutes <= 0) fail(422, `${label}: el fin tiene que ser posterior al inicio`)
    if (hasDuration && Number(input.durationMinutes) !== minutes) fail(422, `${label}: el fin y la duración no coinciden`)
    return { endsAt, durationMinutes: assertDuration(minutes, label) }
  }
  const minutes = assertDuration(hasDuration ? Number(input.durationMinutes) : fallbackMinutes, label)
  return { endsAt: addMinutes(scheduledAt, minutes), durationMinutes: minutes }
}

export function parseAppointmentType(value: unknown): string {
  if (!(APPOINTMENT_TYPES as readonly string[]).includes(String(value))) fail(422, 'Tipo de cita no válido')
  return String(value)
}

export function parseAppointmentStatus(value: unknown): string {
  if (!(APPOINTMENT_STATUSES as readonly string[]).includes(String(value))) fail(422, 'Estado inválido')
  return String(value)
}

/** Canal de la cita; sin canal, el del tipo. Una videollamada sólo puede ser por vídeo. */
export function resolveChannel(type: string, channel: unknown): string {
  const value = channel === undefined || channel === null || channel === '' ? defaultChannelFor(type) : String(channel)
  if (!(APPOINTMENT_CHANNELS as readonly string[]).includes(value)) fail(422, 'Canal no válido')
  if (type === 'video_call' && value !== 'video') fail(422, 'Una videollamada tiene que tener el canal «Videollamada»')
  return value
}

/** `undefined` = no viene; `null` = vaciar; si no, una zona IANA real. */
export function parseTimezone(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isValidTimeZone(value)) fail(422, 'Zona horaria no válida (usa el formato Europe/Madrid)')
  return String(value)
}

/** Texto opcional: `undefined` = no viene; vacío = `null`; recortado y con longitud máxima. */
export function optionalText(value: unknown, label: string, max = 5000): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') fail(422, `${label}: debe ser texto`)
  const t = value.trim()
  if (t.length > max) fail(422, `${label}: admite como máximo ${max} caracteres`)
  return t || null
}

/** Id opcional: `undefined` = no viene; `null`/'' = quitarlo; si no, entero positivo. */
export function optionalId(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '' || value === 0) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) fail(422, `${label} no válido`)
  return n
}

export function parsePropertyKind(value: unknown): PropertyKind {
  if (value !== 'agent' && value !== 'developer') fail(422, 'propertyKind debe ser «agent» (2ª mano) o «developer» (obra nueva)')
  return value
}

export interface AgentRef {
  id: number
  name: string
  slotDurationMinutes: number
  officeId: number | null
}

export async function loadAgent(db: any, orgId: number, agentId: number, label = 'Comercial no encontrado'): Promise<AgentRef> {
  const [row] = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, slotDurationMinutes: schema.teamMembers.slotDurationMinutes, officeId: schema.teamMembers.officeId })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, agentId), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  if (!row) fail(404, label)
  return row
}

export interface LeadRef {
  id: number
  name: string
  email: string | null
  phone: string | null
  contactId: number | null
}

/** 404 si el lead no existe en esta agencia — mismo trato que cualquier referencia ajena. */
export async function loadLead(db: any, orgId: number, leadId: number): Promise<LeadRef> {
  const [row] = await db
    .select({ id: schema.leads.id, name: schema.leads.name, email: schema.leads.email, phone: schema.leads.phone, contactId: schema.leads.contactId })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    .limit(1)
  if (!row) fail(404, 'Lead no encontrado')
  return row
}

export interface ContactRef {
  id: number
  name: string
  email: string | null
  phone: string | null
}

export async function loadContact(db: any, orgId: number, contactId: number): Promise<ContactRef> {
  const [row] = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
    .limit(1)
  if (!row) fail(404, 'Contacto no encontrado')
  return row
}

export interface OfficeRef {
  id: number
  name: string
  timezone: string | null
}

export async function loadOffice(db: any, orgId: number, officeId: number): Promise<OfficeRef> {
  const [row] = await db
    .select({ id: schema.offices.id, name: schema.offices.name, timezone: schema.offices.timezone })
    .from(schema.offices)
    .where(and(eq(schema.offices.id, officeId), eq(schema.offices.organizationId, orgId), isNull(schema.offices.deletedAt)))
    .limit(1)
  if (!row) fail(404, 'Oficina no encontrada')
  return row
}

export async function assertDealInOrg(db: any, orgId: number, dealId: number): Promise<void> {
  const [row] = await db.select({ id: schema.dealOperations.id }).from(schema.dealOperations).where(and(eq(schema.dealOperations.id, dealId), eq(schema.dealOperations.organizationId, orgId))).limit(1)
  if (!row) fail(404, 'Operación no encontrada')
}

/**
 * Inmueble NUEVO en una cita: de esta agencia (404 si no), fuera de la
 * papelera (422) y buscado en SU catálogo. Devuelve el nombre que se guarda
 * en la cita (`propertyName`), igual en los dos catálogos que el resto del
 * panel: nombre en obra nueva; referencia o calle y número en 2ª mano.
 */
export async function resolveLiveProperty(db: any, orgId: number, kind: PropertyKind, propertyId: number, opts: { action?: string; notFoundMessage?: string } = {}): Promise<string | null> {
  await assertLiveProperty(db, orgId, kind, propertyId, { action: opts.action || 'programar una cita', notFoundMessage: opts.notFoundMessage || 'Inmueble no encontrado' })
  return propertyDisplayName(db, orgId, kind, propertyId)
}

export async function propertyDisplayName(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<string | null> {
  if (kind === 'agent') {
    const [row] = await db
      .select({ reference: schema.agentProperties.reference, street: schema.agentProperties.street, streetNumber: schema.agentProperties.streetNumber, city: schema.agentProperties.city })
      .from(schema.agentProperties)
      .where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId)))
      .limit(1)
    if (!row) return null
    return row.reference || [row.street, row.streetNumber].filter(Boolean).join(' ') || row.city || null
  }
  const [row] = await db
    .select({ name: schema.developerProperties.name })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId)))
    .limit(1)
  return row?.name ?? null
}

/** Estado del recordatorio al crear o mover una cita: sin email ni teléfono no hay a quién recordar. */
export function initialReminderStatus(email: string | null | undefined, phone: string | null | undefined): 'pending' | 'not_applicable' {
  return email || phone ? 'pending' : 'not_applicable'
}

import { createError } from 'h3'
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { LANDING_DEMO_FORM } from '../../utils/landing'
import { schema, now } from './db'
import { isValidPhone, requireValidEmail } from './validate'

/**
 * Solicitudes de demo de la landing comercial de INMO (platform_demo_requests,
 * migración 0094). Son DE LA PLATAFORMA, no de ninguna inmobiliaria: no
 * llevan organization_id, no crean leads en ningún CRM y sólo las leen los
 * super admins (Sistema → Solicitudes de demo).
 *
 * Lo que se guarda es lo que la persona escribió, con su consentimiento y su
 * fecha. Nada de contraseñas ni accesos: la demo es una conversación.
 */
export const DEMO_REQUEST_STATUSES = ['new', 'contacted', 'closed'] as const
export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number]

export const DEMO_REQUEST_STATUS_LABEL: Record<DemoRequestStatus, string> = { new: 'Nueva', contacted: 'Contactada', closed: 'Cerrada' }

const TEAM_SIZES = new Set<string>(LANDING_DEMO_FORM.teamSizes.map((o) => o.value))
const INTERESTS = new Set<string>(LANDING_DEMO_FORM.interests.map((o) => o.value))

export function demoTeamSizeLabel(value: string | null | undefined): string | null {
  return LANDING_DEMO_FORM.teamSizes.find((o) => o.value === value)?.label || null
}
export function demoInterestLabel(value: string | null | undefined): string | null {
  return LANDING_DEMO_FORM.interests.find((o) => o.value === value)?.label || null
}

/** Texto corto sin caracteres de control ni espacios de más. */
function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[^\P{Cc}\n]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)
}

export interface DemoRequestInput {
  name: string
  email: string
  company: string
  phone: string | null
  teamSize: string | null
  interest: string | null
  message: string | null
  locale: string | null
}

/** Valida lo que llega del formulario; lanza 422 con un mensaje para la persona. */
export function validateDemoRequest(body: Record<string, any> | null | undefined): DemoRequestInput {
  const name = clean(body?.name, 120)
  const company = clean(body?.company, 120)
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Escribe tu nombre' })
  const email = requireValidEmail(body?.email).toLowerCase().slice(0, 200)
  if (!company) throw createError({ statusCode: 422, statusMessage: 'Escribe el nombre de tu inmobiliaria' })
  if (body?.consent !== true) throw createError({ statusCode: 422, statusMessage: 'Para responderte necesitamos tu permiso para usar estos datos' })
  const phone = clean(body?.phone, 40)
  if (phone && !isValidPhone(phone)) throw createError({ statusCode: 422, statusMessage: 'Revisa el teléfono' })
  const teamSize = clean(body?.teamSize, 10)
  const interest = clean(body?.interest, 20)
  const locale = clean(body?.locale, 10).toLowerCase()
  return {
    name,
    email,
    company,
    phone: phone || null,
    teamSize: TEAM_SIZES.has(teamSize) ? teamSize : null,
    interest: INTERESTS.has(interest) ? interest : null,
    message: cleanMultiline(body?.message, 2000) || null,
    locale: /^[a-z]{2}(-[a-z]{2})?$/.test(locale) ? locale : null,
  }
}

export async function createDemoRequest(db: any, input: DemoRequestInput, requestId: string | null): Promise<{ id: number; createdAt: string }> {
  const createdAt = now()
  const [row] = await db
    .insert(schema.platformDemoRequests)
    .values({ ...input, consentAt: createdAt, status: 'new', requestId, createdAt, updatedAt: createdAt })
    .returning({ id: schema.platformDemoRequests.id })
  return { id: row.id, createdAt }
}

export interface DemoRequestFilters {
  status?: string | null
  q?: string | null
  limit?: number
}

export async function listDemoRequests(db: any, filters: DemoRequestFilters = {}) {
  const t = schema.platformDemoRequests
  const conds = []
  if (filters.status && (DEMO_REQUEST_STATUSES as readonly string[]).includes(filters.status)) conds.push(eq(t.status, filters.status))
  const q = clean(filters.q, 80)
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    conds.push(or(like(t.name, pattern), like(t.email, pattern), like(t.company, pattern)))
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 500)
  const rows = await db
    .select()
    .from(t)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(limit)
  const countRows = await db.select({ status: t.status, n: sql<number>`count(*)` }).from(t).groupBy(t.status)
  const counts: Record<DemoRequestStatus, number> = { new: 0, contacted: 0, closed: 0 }
  for (const r of countRows as Array<{ status: string; n: number }>) {
    if (r.status in counts) counts[r.status as DemoRequestStatus] = Number(r.n)
  }
  return {
    rows: (rows as Array<typeof t.$inferSelect>).map((r) => ({
      ...r,
      teamSizeLabel: demoTeamSizeLabel(r.teamSize),
      interestLabel: demoInterestLabel(r.interest),
    })),
    counts,
  }
}

/** Cambiar el estado y/o las notas internas de una solicitud. Devuelve false si no existe. */
export async function updateDemoRequest(db: any, id: number, patch: { status?: string; notes?: string | null }): Promise<boolean> {
  const t = schema.platformDemoRequests
  const values: Record<string, any> = { updatedAt: now() }
  if (patch.status !== undefined) {
    if (!(DEMO_REQUEST_STATUSES as readonly string[]).includes(patch.status)) throw createError({ statusCode: 422, statusMessage: 'Estado no válido' })
    values.status = patch.status
  }
  if (patch.notes !== undefined) values.notes = cleanMultiline(patch.notes, 4000) || null
  const rows = await db.update(t).set(values).where(eq(t.id, id)).returning({ id: t.id })
  return rows.length > 0
}

/** Borrar solicitudes (RGPD: a petición de la persona). */
export async function deleteDemoRequests(db: any, ids: number[]): Promise<number> {
  if (!ids.length) return 0
  const t = schema.platformDemoRequests
  const rows = await db.delete(t).where(inArray(t.id, ids.slice(0, 100))).returning({ id: t.id })
  return rows.length
}

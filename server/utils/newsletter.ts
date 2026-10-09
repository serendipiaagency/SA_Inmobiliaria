import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'
import { isValidEmail } from './validate'
import { sha256Hex } from './checksum'

/** SHA-256 (hex) de un token: lo único que se guarda de él. */
const hashToken = (token: string) => sha256Hex(new TextEncoder().encode(token))

/**
 * Suscripciones al newsletter de cada inmobiliaria (tabla de la migración
 * 0093): el formulario «Suscríbete» del pie de la web y el listado
 * «Suscriptores» del panel.
 *
 * Lo que hace y lo que no:
 *  - guarda quién quiere recibir novedades de ESA empresa, con su
 *    consentimiento (la política de privacidad aceptada, con fecha), sin
 *    duplicados (una fila por empresa y email: quien repite no se duplica);
 *  - NO envía nada. No hay newsletter automático ni email de bienvenida: el
 *    día que lo haya, cada envío tiene que llevar el enlace de baja;
 *  - doble opt-in preparado: `doubleOptIn` crea la suscripción «pendiente»
 *    con un token de confirmación (para el email que la confirmaría) y
 *    `confirmSubscription` la activa. Hoy el formulario no lo usa porque no
 *    hay email de confirmación que enviar.
 *
 * Los tokens (baja y confirmación) nunca se guardan en claro: sólo su
 * SHA-256. El de baja sólo se entrega a quien acaba de apuntarse (su
 * enlace «darse de baja») y, en el futuro, en cada envío.
 */

export type NewsletterStatus = 'subscribed' | 'pending' | 'unsubscribed'
export const NEWSLETTER_STATUSES: NewsletterStatus[] = ['subscribed', 'pending', 'unsubscribed']
/** Cuánto vale el enlace de confirmación del doble opt-in. */
export const CONFIRM_TTL_HOURS = 72

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const TOKEN_RE = /^[0-9a-f]{48}$/

function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

export function normalizeNewsletterEmail(value: unknown): string {
  const email = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!email || email.length > 254 || !isValidEmail(email)) throw createError({ statusCode: 422, statusMessage: 'Revisa el email' })
  return email
}

export interface SubscribeInput {
  email: string
  locale?: string | null
  source?: string
  /** Doble opt-in: queda «pendiente» hasta confirmar desde su email. */
  doubleOptIn?: boolean
}

export interface SubscribeResult {
  status: NewsletterStatus
  /** Alta nueva (o vuelta tras darse de baja): sólo entonces hay token de baja que entregar. */
  created: boolean
  /** El token del enlace «darse de baja» (en claro una sola vez); null si ya estaba suscrito. */
  unsubscribeToken: string | null
  /** Sólo con doble opt-in: el token del email de confirmación. */
  confirmToken: string | null
}

/**
 * Apunta (o reactiva) un email en el newsletter de una empresa. Quien ya
 * estaba suscrito no se duplica ni cambia: se responde igual, sin token nuevo
 * (así nadie puede conseguir el enlace de baja de otra persona apuntándola).
 */
export async function subscribeToNewsletter(db: any, orgIdInput: number | null, input: SubscribeInput): Promise<SubscribeResult> {
  const orgId = requireOrgId(orgIdInput)
  const email = normalizeNewsletterEmail(input.email)
  const ts = now()
  const where = and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.email, email))
  const [existing] = await db.select().from(schema.newsletterSubscriptions).where(where).limit(1)

  if (existing && existing.status === 'subscribed') return { status: 'subscribed', created: false, unsubscribeToken: null, confirmToken: null }

  const unsubscribeToken = randomToken()
  const confirmToken = input.doubleOptIn ? randomToken() : null
  const values = {
    status: (input.doubleOptIn ? 'pending' : 'subscribed') as NewsletterStatus,
    source: String(input.source || 'footer').slice(0, 40),
    locale: input.locale ? String(input.locale).slice(0, 8) : null,
    consentAt: ts,
    unsubscribeTokenHash: await hashToken(unsubscribeToken),
    confirmTokenHash: confirmToken ? await hashToken(confirmToken) : null,
    confirmExpiresAt: confirmToken ? new Date(Date.now() + CONFIRM_TTL_HOURS * 3600_000).toISOString() : null,
    confirmedAt: null,
    unsubscribedAt: null,
    updatedAt: ts,
  }

  if (existing) {
    await db.update(schema.newsletterSubscriptions).set(values).where(where)
  } else {
    // Dos envíos simultáneos del mismo email: el índice único deja entrar
    // uno; el otro no duplica nada.
    await db
      .insert(schema.newsletterSubscriptions)
      .values({ organizationId: orgId, email, createdAt: ts, ...values })
      .onConflictDoNothing()
  }
  return { status: values.status, created: true, unsubscribeToken, confirmToken }
}

/** Darse de baja con el token del enlace. Repetirlo no falla (ya estaba de baja). */
export async function unsubscribeByToken(db: any, orgIdInput: number | null, token: unknown): Promise<{ email: string }> {
  const orgId = requireOrgId(orgIdInput)
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw createError({ statusCode: 404, statusMessage: 'Enlace no válido' })
  const hash = await hashToken(token)
  const where = and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.unsubscribeTokenHash, hash))
  const [row] = await db.select().from(schema.newsletterSubscriptions).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Enlace no válido' })
  if (row.status !== 'unsubscribed') {
    const ts = now()
    await db.update(schema.newsletterSubscriptions).set({ status: 'unsubscribed', unsubscribedAt: ts, confirmTokenHash: null, confirmExpiresAt: null, updatedAt: ts }).where(where)
  }
  return { email: row.email }
}

/** Doble opt-in: confirma una suscripción pendiente con el token de su email. */
export async function confirmSubscription(db: any, orgIdInput: number | null, token: unknown): Promise<{ email: string }> {
  const orgId = requireOrgId(orgIdInput)
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw createError({ statusCode: 404, statusMessage: 'Enlace no válido' })
  const hash = await hashToken(token)
  const where = and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.confirmTokenHash, hash))
  const [row] = await db.select().from(schema.newsletterSubscriptions).where(where).limit(1)
  if (!row || row.status !== 'pending') throw createError({ statusCode: 404, statusMessage: 'Enlace no válido' })
  if (row.confirmExpiresAt && row.confirmExpiresAt < new Date().toISOString()) throw createError({ statusCode: 410, statusMessage: 'El enlace ha caducado: vuelve a suscribirte' })
  const ts = now()
  await db.update(schema.newsletterSubscriptions).set({ status: 'subscribed', confirmedAt: ts, confirmTokenHash: null, confirmExpiresAt: null, updatedAt: ts }).where(where)
  return { email: row.email }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface NewsletterListItem {
  id: number
  email: string
  status: NewsletterStatus
  source: string
  locale: string | null
  consentAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  createdAt: string
}

const LIST_COLUMNS = {
  id: schema.newsletterSubscriptions.id,
  email: schema.newsletterSubscriptions.email,
  status: schema.newsletterSubscriptions.status,
  source: schema.newsletterSubscriptions.source,
  locale: schema.newsletterSubscriptions.locale,
  consentAt: schema.newsletterSubscriptions.consentAt,
  confirmedAt: schema.newsletterSubscriptions.confirmedAt,
  unsubscribedAt: schema.newsletterSubscriptions.unsubscribedAt,
  createdAt: schema.newsletterSubscriptions.createdAt,
}

/** El listado del panel (sin tokens): filtro por estado y búsqueda por email. */
export async function listSubscriptions(
  db: any,
  orgIdInput: number | null,
  opts: { status?: string; q?: string; limit?: number; offset?: number } = {},
): Promise<{ items: NewsletterListItem[]; total: number; counts: Record<NewsletterStatus, number> }> {
  const orgId = requireOrgId(orgIdInput)
  const conds = [eq(schema.newsletterSubscriptions.organizationId, orgId)]
  if (opts.status && (NEWSLETTER_STATUSES as string[]).includes(opts.status)) conds.push(eq(schema.newsletterSubscriptions.status, opts.status))
  const q = String(opts.q || '')
    .trim()
    .toLowerCase()
    .replace(/[%_]/g, '')
    .slice(0, 100)
  if (q) conds.push(or(like(schema.newsletterSubscriptions.email, `%${q}%`))!)
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 5000)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const [items, totalRows, countRows] = await Promise.all([
    db
      .select(LIST_COLUMNS)
      .from(schema.newsletterSubscriptions)
      .where(and(...conds))
      .orderBy(desc(schema.newsletterSubscriptions.createdAt), desc(schema.newsletterSubscriptions.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(schema.newsletterSubscriptions).where(and(...conds)),
    db
      .select({ status: schema.newsletterSubscriptions.status, n: count() })
      .from(schema.newsletterSubscriptions)
      .where(eq(schema.newsletterSubscriptions.organizationId, orgId))
      .groupBy(schema.newsletterSubscriptions.status),
  ])
  const counts: Record<NewsletterStatus, number> = { subscribed: 0, pending: 0, unsubscribed: 0 }
  for (const r of countRows) if ((NEWSLETTER_STATUSES as string[]).includes(r.status)) counts[r.status as NewsletterStatus] = Number(r.n) || 0
  return { items, total: Number(totalRows[0]?.n) || 0, counts }
}

/** La empresa da de baja a alguien (porque lo pide por otra vía). */
export async function adminUnsubscribe(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.id, id))
  const [row] = await db.select({ status: schema.newsletterSubscriptions.status }).from(schema.newsletterSubscriptions).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Suscripción no encontrada' })
  if (row.status === 'unsubscribed') return
  const ts = now()
  await db.update(schema.newsletterSubscriptions).set({ status: 'unsubscribed', unsubscribedAt: ts, confirmTokenHash: null, confirmExpiresAt: null, updatedAt: ts }).where(where)
}

/** Supresión (RGPD): la fila desaparece. */
export async function deleteSubscription(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.id, id))
  const [row] = await db.select({ id: schema.newsletterSubscriptions.id }).from(schema.newsletterSubscriptions).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Suscripción no encontrada' })
  await db.delete(schema.newsletterSubscriptions).where(where)
}

const CSV_STATUS: Record<NewsletterStatus, string> = { subscribed: 'Suscrito', pending: 'Pendiente de confirmar', unsubscribed: 'Baja' }

/** CSV para exportar (Excel en español: `;` y BOM). Un email que empiece por =,+,-,@ no se interpreta como fórmula. */
export function subscriptionsCsv(items: NewsletterListItem[]): string {
  const cell = (v: unknown) => {
    let s = String(v ?? '')
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [['Email', 'Estado', 'Origen', 'Idioma', 'Alta', 'Consentimiento', 'Confirmado', 'Baja']]
  for (const i of items) rows.push([i.email, CSV_STATUS[i.status] || i.status, i.source, i.locale || '', i.createdAt, i.consentAt, i.confirmedAt || '', i.unsubscribedAt || ''])
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

import { and, eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { recomputeLeadScore, recomputeLeadScoresForContact } from '../leads/score'

/**
 * Enlaces personales a una ficha (FASE 32, migración 0087).
 *
 * «Abrió fichas» del Lead Score sólo contaba la lectura confirmada de
 * WhatsApp. Por email y por el chat web no hay acuse de lectura, así que la
 * única apertura verificable es que la persona abra SU enlace: una ficha
 * compartida desde un hilo web lleva `/propiedades/<slug>?f=<token>`, un
 * token aleatorio que identifica a quién se envió (Contact y/o Lead) y qué
 * propiedad. Reglas:
 *
 *   - Sólo se crea un enlace personal si el hilo tiene una persona conocida
 *     (Contact o Lead): sin ella no hay a quién atribuir la apertura y se
 *     comparte el enlace público normal.
 *   - Sólo obra nueva (`developer`) tiene ficha pública; 2ª mano no tiene
 *     enlace que abrir, así que nunca tiene enlace personal.
 *   - Una apertura sólo cuenta si llega con un token válido de ESA agencia y
 *     de ESA propiedad, y la registra el navegador al pintar la ficha
 *     (`POST /api/public/properties/:slug/view` con `{ f }`): un escáner de
 *     enlaces de correo que sólo hace GET de la URL no ejecuta esa llamada.
 *   - Se guarda el SHA-256 del token, nunca el token.
 */

export const SHARE_LINK_PARAM = 'f'
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/

export async function sha256OfText(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Token aleatorio en base64url (sin relleno), apto para una URL. */
export function randomUrlToken(bytes = 24): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes))
  let bin = ''
  for (const b of raw) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isWellFormedShareToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

/** La URL pública de la ficha con el parámetro del enlace personal. */
export function personalPropertyUrl(baseUrl: string, token: string): string {
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${SHARE_LINK_PARAM}=${encodeURIComponent(token)}`
}

export interface CreateShareLinkInput {
  orgId: number
  propertyId: number
  contactId: number | null
  leadId: number | null
  channel: 'email' | 'chat'
  webMessageId?: number | null
  createdBy?: number | null
}

/** Crea el enlace personal y devuelve el token (la única vez que existe en claro). */
export async function createPropertyShareLink(db: any, input: CreateShareLinkInput): Promise<{ id: number; token: string }> {
  if (!input.contactId && !input.leadId) throw new Error('Un enlace personal necesita una persona (Contact o Lead).')
  const token = randomUrlToken()
  const [row] = await db
    .insert(schema.propertyShareLinks)
    .values({
      organizationId: input.orgId,
      tokenHash: await sha256OfText(token),
      propertyKind: 'developer',
      propertyId: input.propertyId,
      contactId: input.contactId,
      leadId: input.leadId,
      channel: input.channel,
      webMessageId: input.webMessageId ?? null,
      createdBy: input.createdBy ?? null,
      openCount: 0,
      createdAt: now(),
    })
    .returning({ id: schema.propertyShareLinks.id })
  return { id: row.id, token }
}

/**
 * Registra la apertura de un enlace personal. Devuelve `counted: false` (y no
 * toca nada) si el token no existe, es de otra agencia o de otra propiedad.
 * La primera apertura deja `PROPERTY_SHARE_OPENED` en Activity y recalcula
 * el Lead Score de esa persona.
 */
export async function recordPropertyShareLinkOpen(db: any, orgId: number, propertyId: number, token: unknown): Promise<{ counted: boolean; first: boolean }> {
  if (!isWellFormedShareToken(token)) return { counted: false, first: false }
  const L = schema.propertyShareLinks
  const [link] = await db
    .select()
    .from(L)
    .where(and(eq(L.tokenHash, await sha256OfText(token)), eq(L.organizationId, orgId), eq(L.propertyKind, 'developer'), eq(L.propertyId, propertyId)))
    .limit(1)
  if (!link) return { counted: false, first: false }
  const ts = now()
  const first = !link.firstOpenedAt
  await db
    .update(L)
    .set({ openCount: sql`${L.openCount} + 1`, lastOpenedAt: ts, firstOpenedAt: link.firstOpenedAt ?? ts })
    .where(eq(L.id, link.id))
  if (first) {
    try {
      await recordActivity(db, orgId, {
        eventType: 'PROPERTY_SHARE_OPENED',
        entityType: 'property_share_link',
        entityId: link.id,
        contactId: link.contactId,
        leadId: link.leadId,
        propertyId: link.propertyId,
        propertyKind: 'developer',
        actorType: 'contact',
        metadata: { via: 'link', channel: link.channel },
      })
      if (link.leadId) await recomputeLeadScore(db, orgId, link.leadId, 'signal')
      else if (link.contactId) await recomputeLeadScoresForContact(db, orgId, link.contactId)
    } catch {
      // La apertura ya quedó guardada; actividad y puntuación se rehacen con la próxima señal.
    }
  }
  return { counted: true, first }
}

import { and, eq } from 'drizzle-orm'
import { createError, getQuery, getRequestHeader, readBody, type H3Event } from 'h3'
import * as schema from '../../db/schema'
import { resolvePublicOrgId, useDb } from '../db'
import { rateLimit } from '../rateLimit'
import { isValidEmail, isValidPhone } from '../validate'
import { upsertLead } from '../leads'
import { readFirstTouch } from '../firstTouch'
import { livePropertyCond } from '../properties/trash'
import { getCommsSettings } from './inbox'
import { pollWebChat, postWebChatMessage, startWebChat } from './web'

/**
 * El chat de la web pública (bloque N8a, FASE 29) visto desde HTTP. Vive
 * como rama de `POST /api/public/contact?channel=chat&action=…` — el
 * presupuesto de rutas de Nitro está a cero (docs/property-schema-registry.md)
 * y es, de hecho, otra forma de contactar con la agencia.
 *
 * Protección:
 *   - La agencia la decide el host (`resolvePublicOrgId`), nunca el cuerpo.
 *   - Sólo si la agencia activó el chat (Comunicaciones → Configuración).
 *   - Límite de tasa por IP y acción ANTES de leer el cuerpo
 *     (`server/utils/rateLimit.ts`): abrir 5/10 min, escribir 30/5 min,
 *     sondear 120/10 min. Además, un hilo no admite más de 15 mensajes
 *     seguidos del visitante sin respuesta (server/utils/comms/web.ts).
 *   - Campo trampa (`website`) que una persona nunca rellena; nombre, email,
 *     teléfono y mensaje validados y acotados; como mucho 3 enlaces por mensaje.
 *   - El token del visitante es la única credencial: opaco, sólo se guarda su
 *     SHA-256, y sólo da acceso a SU hilo en ESA agencia. Ni cookies (el
 *     widget lo guarda en el almacenamiento local de la web de la agencia),
 *     ni CORS: otra web no puede leer estas respuestas.
 */

export const WEB_CHAT_ACTIONS = ['start', 'send', 'poll'] as const
type WebChatAction = (typeof WEB_CHAT_ACTIONS)[number]

const LIMITS: Record<WebChatAction, { limit: number; windowSeconds: number }> = {
  start: { limit: 5, windowSeconds: 600 },
  send: { limit: 30, windowSeconds: 300 },
  poll: { limit: 120, windowSeconds: 600 },
}

/** Sólo la ruta (sin host) de la página desde la que se escribió, y sólo si es de esta misma web. */
export function samePagePath(event: H3Event): string | null {
  const referer = getRequestHeader(event, 'referer')
  const host = getRequestHeader(event, 'host')
  if (!referer || !host) return null
  try {
    const url = new URL(referer)
    if (url.host !== host) return null
    return `${url.pathname}${url.search}`.slice(0, 300)
  } catch {
    return null
  }
}

/** Una propiedad pública (obra nueva, viva) de la agencia por su slug, o null. */
export async function publicPropertyBySlug(db: any, orgId: number, slug: unknown): Promise<{ id: number; name: string } | null> {
  if (typeof slug !== 'string' || !slug.trim() || slug.length > 200) return null
  const P = schema.developerProperties
  const [row] = await db
    .select({ id: P.id, name: P.name })
    .from(P)
    .where(and(eq(P.slug, slug.trim()), eq(P.organizationId, orgId), livePropertyCond(P)))
    .limit(1)
  return row ?? null
}

export async function handlePublicWebChat(event: H3Event) {
  const action = String(getQuery(event).action || '') as WebChatAction
  if (!(WEB_CHAT_ACTIONS as readonly string[]).includes(action)) throw createError({ statusCode: 400, statusMessage: 'Acción de chat no válida.' })
  await rateLimit(event, `webchat-${action}`, LIMITS[action])

  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  const settings = await getCommsSettings(db, orgId)
  if (!settings.webChatEnabled) throw createError({ statusCode: 404, statusMessage: 'El chat no está disponible en esta web.' })

  const body = ((await readBody(event).catch(() => null)) || {}) as Record<string, any>

  if (action === 'poll') return pollWebChat(db, orgId, body.token, body.after)
  if (action === 'send') return { message: await postWebChatMessage(db, orgId, body.token, body.message) }

  // start
  if (typeof body.website === 'string' && body.website.trim()) throw createError({ statusCode: 400, statusMessage: 'Solicitud no válida.' })
  const email = body.email ? String(body.email).trim() : ''
  const phone = body.phone ? String(body.phone).trim() : ''
  if (email && !isValidEmail(email)) throw createError({ statusCode: 422, statusMessage: 'El email no es válido.' })
  if (phone && !isValidPhone(phone)) throw createError({ statusCode: 422, statusMessage: 'El teléfono no es válido.' })
  const property = await publicPropertyBySlug(db, orgId, body.propertySlug)
  const firstTouch = readFirstTouch(event)
  const result = await startWebChat(
    db,
    { orgId, name: String(body.name || ''), email: email || null, phone: phone || null, message: String(body.message ?? ''), propertyId: property?.id ?? null, propertyName: property?.name ?? null, pageUrl: samePagePath(event) },
    {
      token: body.token,
      // El pipeline central de leads (Contact + dedup, Activity, enrutado, aviso): sólo con un dato de contacto.
      createLead: (l) =>
        upsertLead(event, {
          organizationId: orgId,
          name: l.name,
          email: l.email,
          phone: l.phone,
          source: 'web',
          sourceDetail: 'Chat web',
          originalMessage: l.message,
          propertyId: l.propertyId,
          propertyName: l.propertyName,
          notes: 'Escribió por el chat de la web.',
          ...firstTouch,
        }),
    },
  )
  return { token: result.token, expiresAt: result.expiresAt, status: result.status, messages: result.messages }
}

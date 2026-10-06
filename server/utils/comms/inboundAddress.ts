/**
 * Email entrante (FASE 29): la dirección de respuesta FIRMADA de un hilo web.
 *
 * Hasta ahora el email de un hilo era sólo de salida: el «Responder a» era el
 * buzón de la agencia y la respuesta del cliente acababa fuera de la
 * plataforma. Con el email entrante configurado, cada respuesta por email de
 * un hilo sale con
 *
 *     Reply-To: respuestas+<orgId>-<threadId>-<firma>@<INBOUND_EMAIL_DOMAIN>
 *
 * y Cloudflare Email Routing entrega lo que llega a esa dirección al Worker
 * (server/plugins/inbound-email.ts → server/utils/comms/inboundEmail.ts), que
 * lo añade a ESE hilo. Sólo cambia el Reply-To: el remitente (From) sigue
 * siendo exactamente el de siempre (el de la plataforma o el dominio
 * verificado de la agencia, server/utils/email/orgSender.ts) — nunca se
 * envía «como» otra dirección.
 *
 * Por qué `respuestas+…` (subdirección, RFC 5233) y no un local-part libre:
 * Email Routing sólo admite la regla «catch-all» en el dominio raíz de la
 * zona; en un subdominio hay que nombrar cada dirección. Con la subdirección
 * basta UNA regla literal (`respuestas@<dominio>` → Worker, con
 * «Subaddressing» activado), funciona igual en un subdominio dedicado —lo
 * recomendable: no toca los MX del dominio con el que la plataforma ya recibe
 * correo— y también con un catch-all en un dominio raíz.
 *
 * La firma es un HMAC-SHA256 de (organización, hilo) con el secreto
 * INBOUND_EMAIL_SECRET, truncado a 80 bits en hexadecimal (las direcciones de
 * email no distinguen mayúsculas de forma fiable): sin el secreto no se puede
 * escribir en el hilo de nadie adivinando ids, y un hilo de otra agencia con
 * la firma de éste no vale. Cambiar el secreto invalida todas las direcciones
 * ya enviadas (una respuesta a un email antiguo se rechazaría).
 *
 * El secreto sólo se usa aquí, para firmar y verificar: nunca sale en una
 * respuesta HTTP, un log, Activity ni auditoría — el panel sólo sabe si está
 * puesto (`inboundEmailStatus`).
 */

/** El buzón base de la regla de Email Routing; la parte tras el `+` identifica el hilo. */
export const INBOUND_MAILBOX = 'respuestas'
/** Caracteres hexadecimales de la firma: 20 = 80 bits. */
export const INBOUND_SIGNATURE_HEX = 20
/** Longitud mínima del secreto para considerarlo configurado. */
export const INBOUND_SECRET_MIN_LENGTH = 32

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const ADDRESS_RE = new RegExp(`^${INBOUND_MAILBOX}\\+([1-9]\\d{0,9})-([1-9]\\d{0,9})-([0-9a-f]{${INBOUND_SIGNATURE_HEX}})@([a-z0-9.-]+)$`)

export interface InboundEmailStatus {
  /** Sólo `true` con dominio válido y secreto suficiente: entonces los emails de los hilos salen con la dirección firmada. */
  active: boolean
  domain: string | null
  /** La dirección de la regla de Email Routing (`respuestas@<dominio>`), cuando hay dominio válido. */
  routingAddress: string | null
  /** Qué falta, en castellano y sin valores: nunca el secreto ni un fragmento. */
  missing: string[]
}

function configuredDomain(env: Record<string, any>): { domain: string | null; valid: boolean } {
  const raw = typeof env?.INBOUND_EMAIL_DOMAIN === 'string' ? env.INBOUND_EMAIL_DOMAIN.trim().toLowerCase().replace(/\.$/, '') : ''
  if (!raw) return { domain: null, valid: false }
  return { domain: raw, valid: DOMAIN_RE.test(raw) }
}

function configuredSecret(env: Record<string, any>): string | null {
  const raw = typeof env?.INBOUND_EMAIL_SECRET === 'string' ? env.INBOUND_EMAIL_SECRET : ''
  return raw.length >= INBOUND_SECRET_MIN_LENGTH ? raw : null
}

/** Estado del email entrante para el panel y Estado del sistema. Presencia y validez, nunca valores secretos. */
export function inboundEmailStatus(env: Record<string, any> = {}): InboundEmailStatus {
  const { domain, valid } = configuredDomain(env)
  const secretRaw = typeof env?.INBOUND_EMAIL_SECRET === 'string' ? env.INBOUND_EMAIL_SECRET : ''
  const missing: string[] = []
  if (!domain) missing.push('La variable INBOUND_EMAIL_DOMAIN del Worker: el dominio (o subdominio) con Email Routing que recibe las respuestas.')
  else if (!valid) missing.push('INBOUND_EMAIL_DOMAIN no es un nombre de dominio válido (sólo el dominio, sin «@» ni «https://»).')
  if (!secretRaw) missing.push('El secreto INBOUND_EMAIL_SECRET del Worker, con el que se firman las direcciones de respuesta.')
  else if (secretRaw.length < INBOUND_SECRET_MIN_LENGTH) missing.push(`INBOUND_EMAIL_SECRET es demasiado corto: tiene que tener al menos ${INBOUND_SECRET_MIN_LENGTH} caracteres aleatorios.`)
  const active = valid && Boolean(configuredSecret(env))
  return { active, domain: valid ? domain : null, routingAddress: valid ? `${INBOUND_MAILBOX}@${domain}` : null, missing }
}

async function signature(secret: string, orgId: number, threadId: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  // Prefijo de dominio y versión: esta firma no puede reutilizarse como la de otro uso del mismo secreto.
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`inbound-reply:v1:${orgId}:${threadId}`))
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, INBOUND_SIGNATURE_HEX)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function validId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

/**
 * La dirección de respuesta firmada del hilo web `threadId` de la agencia
 * `orgId`, o `null` si el email entrante no está configurado — y entonces el
 * envío conserva el «Responder a» de la agencia, exactamente como antes.
 */
export async function threadReplyAddress(env: Record<string, any>, orgId: number, threadId: number): Promise<string | null> {
  const { domain, valid } = configuredDomain(env)
  const secret = configuredSecret(env)
  if (!valid || !secret || !validId(orgId) || !validId(threadId)) return null
  return `${INBOUND_MAILBOX}+${orgId}-${threadId}-${await signature(secret, orgId, threadId)}@${domain}`
}

/**
 * Verifica el destinatario de un email entrante (el RCPT TO del sobre, no la
 * cabecera To, que escribe quien envía). Devuelve la agencia y el hilo sólo
 * si el formato, el dominio configurado y la firma cuadran; cualquier otra
 * cosa es `null`, sin distinguir el motivo.
 */
export async function verifyReplyAddress(env: Record<string, any>, rawTo: unknown): Promise<{ orgId: number; threadId: number } | null> {
  const { domain, valid } = configuredDomain(env)
  const secret = configuredSecret(env)
  if (!valid || !secret || typeof rawTo !== 'string') return null
  const to = rawTo.trim().toLowerCase().replace(/^<|>$/g, '')
  const m = ADDRESS_RE.exec(to)
  if (!m || m[4] !== domain) return null
  const orgId = Number(m[1])
  const threadId = Number(m[2])
  if (!validId(orgId) || !validId(threadId)) return null
  return timingSafeEqual(m[3]!, await signature(secret, orgId, threadId)) ? { orgId, threadId } : null
}

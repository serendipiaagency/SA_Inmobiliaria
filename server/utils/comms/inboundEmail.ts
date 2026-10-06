import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import PostalMime, { type Address, type Attachment, type Email } from 'postal-mime'
import * as schema from '../../db/schema'
import { isUniqueConstraintError, now } from '../db'
import { recordActivity } from '../activity/service'
import { recomputeLeadScore, recomputeLeadScoresForContact } from '../leads/score'
import { verifyReplyAddress } from './inboundAddress'
import { sha256OfText } from './shareLinks'
import { appendInboundEmailMessage, webThreadKey } from './web'

/**
 * Email entrante (FASE 29): la respuesta de un cliente a un email enviado
 * desde un hilo de la bandeja vuelve a ESE hilo.
 *
 *   Cloudflare Email Routing (regla `respuestas@<dominio>` → Worker)
 *     → hook `cloudflare:email` de Nitro (server/plugins/inbound-email.ts)
 *     → handleInboundEmail(): verificar la dirección firmada del sobre
 *       (inboundAddress.ts), cargar el hilo de ESA agencia, leer el MIME con
 *       postal-mime, quitar la cita del mensaje anterior, acotar, y guardarlo
 *       como mensaje `in` por `email` del hilo (web.ts#appendInboundEmailMessage).
 *
 * Lo que dispara, igual que un mensaje entrante del chat o de WhatsApp:
 *   - no leído en la bandeja y el hilo reabierto si estaba cerrado;
 *   - `leads.last_contact_at` del lead del hilo (la última interacción real,
 *     lo mismo que hace upsertLead cuando la misma persona vuelve a escribir
 *     por un formulario): cierra «sin contacto X días» en el siguiente
 *     repaso del SLA. NO `markLeadContacted`: eso marca el primer contacto /
 *     primera respuesta HUMANA de la agencia, y aquí quien escribe es el cliente;
 *   - Activity `EMAIL_REPLY_RECEIVED` (sin el texto del correo en metadata);
 *   - Lead Score: es la señal «respondió recientemente», como un WhatsApp entrante.
 *   Ninguna automatización escucha hoy mensajes entrantes (sus disparadores
 *   están en utils/automationCatalog.ts): no hay nada más que avisar.
 *
 * Rechazo (`message.setReject`, error SMTP permanente que recibe quien envía):
 * dirección sin firma válida, de otro dominio, hilo inexistente o de otra
 * agencia, o email entrante sin configurar → SIEMPRE la misma razón genérica,
 * sin decir cuál de las cosas falló. Sólo con una dirección válida se dice
 * algo más concreto (demasiado grande, demasiados mensajes, ilegible). Las
 * razones van en ASCII: viajan en una respuesta SMTP.
 *
 * Adjuntos: NO se guardan. La dirección firmada autentica el hilo, no a la
 * persona (cualquiera a quien se reenvíe el correo puede escribir en él), y
 * guardar sin revisión lo que adjunte cualquiera —DNI, nóminas, o un
 * ejecutable— en el R2 de la agencia sería almacenar datos personales y
 * posibles programas maliciosos que nadie ha pedido. El mensaje dice qué
 * adjuntos traía (nombre, tamaño y si es un ejecutable) para que el equipo
 * los pida por un canal donde decida guardarlos.
 *
 * Privacidad: nada del contenido va a logs; `comms_webhook_events` guarda
 * sólo hilo, tamaño y número de adjuntos (idempotencia por Message-ID, como
 * los webhooks de WhatsApp); el secreto de la firma no sale de inboundAddress.ts.
 */

export const INBOUND_EMAIL_PROVIDER = 'email_inbound'
/** Tamaño máximo del correo crudo que se lee (Email Routing admite hasta 25 MiB; los adjuntos no se guardan). */
export const INBOUND_EMAIL_MAX_BYTES = 10 * 1024 * 1024
/** Caracteres del texto que se guarda en el hilo (lo mismo que un formulario web). */
export const INBOUND_EMAIL_BODY_MAX = 5000
/** Freno contra un bucle de respuestas automáticas o alguien con la dirección: emails por hilo y hora. */
export const INBOUND_EMAILS_PER_THREAD_PER_HOUR = 20
const ATTACHMENTS_LISTED = 5

/** Razones del rechazo SMTP. ASCII: viajan en la respuesta SMTP a quien envía. */
export const INBOUND_REJECT_REASONS = {
  address: 'Esta direccion no acepta mensajes.',
  too_large: 'Mensaje demasiado grande (maximo 10 MB). Envia los archivos por otro medio.',
  rate_limited: 'Demasiados mensajes en poco tiempo. Intentalo de nuevo mas tarde.',
  unreadable: 'No se ha podido leer el mensaje.',
  failed: 'No se ha podido entregar el mensaje. Intentalo de nuevo mas tarde.',
} as const
export type InboundRejectReason = keyof typeof INBOUND_REJECT_REASONS

/** Lo que se usa de `ForwardableEmailMessage` (Cloudflare): así las pruebas pasan un objeto simple. */
export interface InboundEmailMessage {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream<Uint8Array>
  readonly rawSize: number
  readonly headers: Headers
  setReject(reason: string): void
}

export type InboundEmailOutcome =
  | { status: 'stored'; orgId: number; threadId: number; messageId: number }
  | { status: 'duplicate'; orgId: number; threadId: number }
  | { status: 'ignored'; orgId: number; threadId: number; reason: 'auto_reply' }
  | { status: 'rejected'; reason: InboundRejectReason }

// --- texto de la respuesta ------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ograve: 'ò',
  iexcl: '¡', iquest: '¿', euro: '€', copy: '©', reg: '®', deg: '°', middot: '·', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•',
}

/** Una sola pasada: `&amp;lt;` queda como `&lt;`, no como `<`. */
function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity] ?? match
  })
}

/**
 * Dónde empieza la cita del mensaje anterior en el HTML de los clientes de
 * correo habituales (Gmail, Outlook, Thunderbird, Yahoo, Apple Mail): todo lo
 * que hay desde ahí es nuestro propio email citado.
 */
const HTML_QUOTE_MARKERS = [
  /<div[^>]*class=["'][^"']*\bgmail_quote\b/i,
  /<div[^>]*id=["']?(?:appendonsend|divRplyFwdMsg)\b/i,
  /<div[^>]*class=["'][^"']*\b(?:moz-cite-prefix|yahoo_quoted)\b/i,
  /<hr[^>]*id=["']?stopSpelling/i,
  /<blockquote\b/i,
]

/** HTML de una respuesta → texto: sin la cita, sin estilos ni scripts, con los saltos de línea de los bloques. */
export function htmlReplyToText(html: string): string {
  let cut = html.length
  for (const re of HTML_QUOTE_MARKERS) {
    const m = re.exec(html)
    if (m && m.index < cut) cut = m.index
  }
  return decodeEntities(
    html
      .slice(0, cut)
      .replace(/<(style|script|title|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, '').trim()
        return /^https?:\/\//i.test(href) && text && text !== href ? `${text} (${href})` : text || href
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|li|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

/** «El lun, 6 oct 2026 a las 10:00, Agencia <…> escribió:» y equivalentes en otros idiomas. */
const QUOTE_ATTRIBUTION_RE = /^\s*>?\s*(?:on|el|le|am|il|em|op|w dniu)\b.{0,300}\b(?:wrote|escribió|escribio|a écrit|a ecrit|schrieb|ha scritto|escreveu|schreef|napisał)\s*:?\s*$/i
const QUOTE_ATTRIBUTION_START_RE = /^\s*(?:on|el|le|am|il|em|op|w dniu)\b/i
const ORIGINAL_MESSAGE_RE = /^\s*-{2,}\s*(?:original message|mensaje original|message d'origine|ursprüngliche nachricht|messaggio originale|mensagem original)\s*-{2,}\s*$/i
const HEADER_FROM_RE = /^\s*\*?(?:from|de|von|da|van)\s*:\*?\s+\S/i
const HEADER_NEXT_RE = /^\s*\*?(?:sent|enviado|fecha|date|gesendet|inviato|envoyé|to|para|subject|asunto)\s*:/i

/**
 * Quita del texto la cita del mensaje anterior (la que añade el cliente de
 * correo al responder): la línea «… escribió:», el bloque «De: / Enviado:»
 * de Outlook, «--- Mensaje original ---» y un bloque final de líneas con «>».
 * Una respuesta intercalada (texto entre citas) se deja entera. Si quitar la
 * cita dejara el mensaje vacío, se devuelve el texto completo: es mejor ver
 * la cita que perder lo que escribió.
 */
export function stripQuotedReply(input: string): string {
  const text = input.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  let cut = lines.length
  for (let i = 0; i < lines.length && cut === lines.length; i++) {
    const line = lines[i]!
    const next = lines[i + 1] ?? ''
    if (QUOTE_ATTRIBUTION_RE.test(line)) cut = i
    // Gmail parte la línea de atribución larga en dos.
    else if (QUOTE_ATTRIBUTION_START_RE.test(line) && QUOTE_ATTRIBUTION_RE.test(`${line} ${next}`)) cut = i
    else if (ORIGINAL_MESSAGE_RE.test(line)) cut = i
    else if (/^\s*_{10,}\s*$/.test(line) && HEADER_FROM_RE.test(next)) cut = i
    else if (HEADER_FROM_RE.test(line) && lines.slice(i + 1, i + 5).some((l) => HEADER_NEXT_RE.test(l))) cut = i
    else if (/^\s*>/.test(line) && lines.slice(i).every((l) => !l.trim() || /^\s*>/.test(l))) cut = i
  }
  const kept = lines.slice(0, cut).join('\n').trim()
  return kept || text.trim()
}

function cleanText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

const EXECUTABLE_EXT = /\.(exe|com|bat|cmd|scr|pif|msi|msp|dll|cpl|jar|js|jse|vbs|vbe|wsf|wsh|hta|ps1|psm1|sh|apk|app|dmg|iso|img|lnk|reg|scf|gadget)$/i
const EXECUTABLE_MIME = /^application\/(x-msdownload|x-msdos-program|x-executable|x-dosexec|x-sh|x-bat|java-archive|vnd\.microsoft\.portable-executable|vnd\.android\.package-archive|x-ms-installer|x-msi|hta)$/i

export function isExecutableAttachment(a: Pick<Attachment, 'filename' | 'mimeType'>): boolean {
  return EXECUTABLE_EXT.test(String(a.filename || '').trim()) || EXECUTABLE_MIME.test(String(a.mimeType || ''))
}

function attachmentSize(a: Attachment): number {
  const c = a.content as any
  if (typeof c === 'string') return c.length
  return typeof c?.byteLength === 'number' ? c.byteLength : 0
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function safeName(a: Attachment): string {
  const name = cleanText(String(a.filename || ''))
    .replace(/[\\/\n]+/g, ' ')
    .slice(0, 100)
  return name || `sin nombre, ${a.mimeType || 'tipo desconocido'}`
}

function formatAddress(address: Address | undefined): string | null {
  if (!address) return null
  const mailbox = address.address ? address : address.group?.[0]
  if (!mailbox?.address) return null
  const name = cleanText(mailbox.name || '').replace(/[<>"]/g, '')
  return (name ? `${name} <${mailbox.address}>` : mailbox.address).slice(0, 200)
}

export interface ExtractedReply {
  body: string
  fields: Record<string, string>
  attachments: number
  truncated: boolean
}

/** Del email ya parseado a lo que se guarda en el hilo: texto sin cita y acotado, asunto, remitente y adjuntos no guardados. */
export function extractReply(email: Email): ExtractedReply {
  const plain = email.text && email.text.trim() ? cleanText(email.text) : ''
  const source = plain || (email.html ? cleanText(htmlReplyToText(email.html)) : '')
  let body = cleanText(stripQuotedReply(source))
  const attachments = email.attachments || []
  if (!body) body = attachments.length ? '(Sin texto: sólo adjuntos)' : '(Respuesta sin texto)'
  const truncated = body.length > INBOUND_EMAIL_BODY_MAX
  if (truncated) body = `${body.slice(0, INBOUND_EMAIL_BODY_MAX - 1)}…`

  const fields: Record<string, string> = {}
  const subject = cleanText(email.subject || '').slice(0, 200)
  if (subject) fields.subject = subject
  const from = formatAddress(email.from)
  if (from) fields.from = from
  if (attachments.length) {
    const listed = attachments.slice(0, ATTACHMENTS_LISTED).map((a) => `${safeName(a)} (${humanSize(attachmentSize(a))}${isExecutableAttachment(a) ? ', ejecutable' : ''})`)
    const more = attachments.length > ATTACHMENTS_LISTED ? ` y ${attachments.length - ATTACHMENTS_LISTED} más` : ''
    fields.attachmentsIgnored = `${listed.join(', ')}${more}. No se guardan en la plataforma: pídelos por otro canal si los necesitas.`
  }
  if (truncated) fields.truncated = `El texto superaba ${INBOUND_EMAIL_BODY_MAX} caracteres y se ha recortado.`
  return { body, fields, attachments: attachments.length, truncated }
}

/**
 * Respuestas automáticas (fuera de la oficina, avisos de entrega, listas):
 * no son la persona respondiendo. Se aceptan —rechazarlas provoca más
 * rebotes— pero no entran en el hilo. RFC 3834 (`Auto-Submitted`) y las
 * cabeceras de facto de Exchange y otros.
 */
export function isAutoGeneratedEmail(headers: Headers, envelopeFrom: string, email?: Pick<Email, 'headers'> | null): boolean {
  const h = (name: string) => (headers.get(name) || email?.headers?.find((x) => x.key === name)?.value || '').trim().toLowerCase()
  const autoSubmitted = h('auto-submitted')
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (h('x-autoreply') || h('x-autorespond') || h('x-autoreply-from')) return true
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(h('precedence'))) return true
  if (/^multipart\/report\b/.test(h('content-type'))) return true
  const from = String(envelopeFrom || '')
    .trim()
    .toLowerCase()
  return !from || from === '<>' || /^(mailer-daemon|postmaster)@/.test(from)
}

// --- entrada al hilo --------------------------------------------------------------------

async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
}

/** Detalle de un fallo para la fila de auditoría SIN el contenido: el mensaje de un error de consulta lleva los parámetros (el cuerpo del correo), el de su causa no. */
function failureNote(e: any): string {
  return `fallo al guardar: ${String(e?.cause?.message || e?.name || 'error').slice(0, 200)}`
}

/**
 * Recibe un email de Cloudflare Email Routing y lo lleva a su hilo, o lo
 * rechaza. Nunca lanza por un email malo: cada salida es un resultado.
 */
export async function handleInboundEmail(db: any, env: Record<string, any>, message: InboundEmailMessage): Promise<InboundEmailOutcome> {
  const reject = (reason: InboundRejectReason): InboundEmailOutcome => {
    message.setReject(INBOUND_REJECT_REASONS[reason])
    return { status: 'rejected', reason }
  }

  // 1) La dirección del sobre: formato, dominio y firma. Sin configurar, tampoco vale.
  const target = await verifyReplyAddress(env, message.to)
  if (!target) return reject('address')

  // 2) El hilo, de ESA agencia. Mismo rechazo genérico que una firma mala.
  const T = schema.commsWebThreads
  const [thread] = await db
    .select()
    .from(T)
    .where(and(eq(T.id, target.threadId), eq(T.organizationId, target.orgId)))
    .limit(1)
  if (!thread) return reject('address')
  const { orgId } = target
  const threadId = thread.id as number

  // 3) Tamaño, antes de leer nada.
  if (Number(message.rawSize) > INBOUND_EMAIL_MAX_BYTES) return reject('too_large')

  // 4) El MIME: texto plano o HTML, quoted-printable/base64 y charsets (postal-mime).
  let raw: ArrayBuffer
  let email: Email
  try {
    raw = await new Response(message.raw).arrayBuffer()
    if (raw.byteLength > INBOUND_EMAIL_MAX_BYTES) return reject('too_large')
    email = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer', maxNestingDepth: 50, maxHeadersSize: 512 * 1024 })
  } catch {
    return reject('unreadable')
  }

  const messageKey = email.messageId ? await sha256OfText(email.messageId.trim().toLowerCase()) : await sha256OfBytes(raw)
  const eventKey = `${orgId}:${threadId}:${messageKey}`
  const auto = isAutoGeneratedEmail(message.headers, message.from, email)
  const payloadJson = JSON.stringify({ thread: webThreadKey(threadId), size: raw.byteLength, attachments: email.attachments?.length ?? 0, auto })
  const E = schema.commsWebhookEvents

  // 5) Respuesta automática: constancia, pero no entra en el hilo.
  if (auto) {
    try {
      await db.insert(E).values({ provider: INBOUND_EMAIL_PROVIDER, eventKey, organizationId: orgId, channelId: null, payloadJson, processedOk: 1, note: 'respuesta automática: no se añade al hilo', receivedAt: now() })
    } catch (e: any) {
      if (!isUniqueConstraintError(e)) return reject('failed')
    }
    return { status: 'ignored', orgId, threadId, reason: 'auto_reply' }
  }

  // 6) Freno por hilo.
  const M = schema.commsWebMessages
  const [recent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(M)
    .where(and(eq(M.threadId, threadId), eq(M.organizationId, orgId), eq(M.direction, 'in'), eq(M.via, 'email'), gte(M.createdAt, hoursAgo(1))))
  if (Number(recent?.n ?? 0) >= INBOUND_EMAILS_PER_THREAD_PER_HOUR) return reject('rate_limited')

  // 7) Idempotencia: el mismo Message-ID en el mismo hilo sólo entra una vez.
  let claimId: number
  try {
    const [row] = await db
      .insert(E)
      .values({ provider: INBOUND_EMAIL_PROVIDER, eventKey, organizationId: orgId, channelId: null, payloadJson, processedOk: 0, receivedAt: now() })
      .returning({ id: E.id })
    claimId = row.id
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return { status: 'duplicate', orgId, threadId }
    return reject('failed')
  }

  // 8) Al hilo.
  const reply = extractReply(email)
  let stored: { id: number; createdAt: string }
  try {
    stored = await appendInboundEmailMessage(db, thread, { body: reply.body, fields: reply.fields })
  } catch (e: any) {
    // Se libera la clave (la fila queda como auditoría del fallo) para que un reenvío del mismo correo pueda entrar.
    await db
      .update(E)
      .set({ eventKey: `${eventKey}:fallo:${claimId}`, processedOk: 0, note: failureNote(e) })
      .where(eq(E.id, claimId))
      .catch(() => null)
    return reject('failed')
  }

  // 9) Efectos sobre la persona. El mensaje ya está en el hilo: un fallo aquí no lo deshace ni rebota el correo.
  const notes = ['mensaje añadido']
  try {
    if (thread.leadId) {
      await db
        .update(schema.leads)
        .set({ lastContactAt: stored.createdAt, updatedAt: stored.createdAt })
        .where(and(eq(schema.leads.id, thread.leadId), eq(schema.leads.organizationId, orgId), isNull(schema.leads.deletedAt)))
    }
    await recordActivity(db, orgId, {
      eventType: 'EMAIL_REPLY_RECEIVED',
      entityType: 'comms_web_message',
      entityId: stored.id,
      contactId: thread.contactId ?? null,
      leadId: thread.leadId ?? null,
      actorType: 'contact',
      metadata: { thread: webThreadKey(threadId), attachmentsIgnored: reply.attachments, truncated: reply.truncated },
    })
    if (thread.leadId) await recomputeLeadScore(db, orgId, thread.leadId, 'signal')
    else if (thread.contactId) await recomputeLeadScoresForContact(db, orgId, thread.contactId)
  } catch (e: any) {
    notes.push(`efectos incompletos: ${String(e?.cause?.message || e?.name || 'error').slice(0, 200)}`)
  }
  await db
    .update(E)
    .set({ processedOk: 1, note: notes.join(' · ') })
    .where(eq(E.id, claimId))
    .catch(() => null)
  return { status: 'stored', orgId, threadId, messageId: stored.id }
}

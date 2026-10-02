import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { EMAIL_RE, platformEmailConfig } from './platformConfig'
import { createResendDomain, findResendDomain, getResendDomain, verifyResendDomain, type ResendDnsRecord, type ResendDomain } from './resendClient'

/**
 * Remitente de cada EMPRESA — los emails que una inmobiliaria envía a SUS
 * clientes y a su equipo (lead recibido, cita confirmada, bienvenida de un
 * usuario, recuperar contraseña…). Distinto del email de plataforma
 * (platform.ts), que siempre sale de INMO.
 *
 *  - Con dominio propio VERIFICADO en Resend:  «Costa Azul <hola@costaazul.es>»
 *  - Sin él (o mientras se verifica):          «Costa Azul vía INMO <info@serendipiaagency.com>»
 *    con Responder-a la dirección de la empresa, para que las respuestas le
 *    lleguen a ella. Nunca se usa una dirección de la empresa sin verificar:
 *    Resend la rechazaría y, peor, sería suplantar un dominio no probado.
 *
 * Verificación autoservicio: al guardar una dirección de un dominio propio,
 * INMO da de alta ese dominio en la cuenta de Resend de la plataforma y
 * enseña los registros DNS que la empresa tiene que publicar; «Comprobar»
 * pide a Resend que mire el DNS. Sólo cuando Resend dice `verified` se envía
 * con esa dirección.
 *
 * Propiedad del dominio: un dominio pertenece a la primera empresa que lo
 * reclama (fila `org:platform:email-domain:<dominio>` en `settings`, sin
 * migración). Otra empresa no puede usar un dominio ya reclamado — aunque
 * esté verificado en la cuenta de Resend — porque eso le permitiría enviar
 * como la otra. Un dominio que ya estaba en Resend sin dueño en INMO (dado de
 * alta a mano) sólo lo puede asignar un super_admin.
 */

/**
 * Emails de CUENTA y del sistema que salen siempre del remitente de la
 * plataforma (INMO <info@serendipiaagency.com>), aunque la empresa tenga su
 * propio dominio: alta y bienvenida de usuarios, recuperar contraseña y los
 * avisos técnicos del dominio web. Los de plataforma (company_*, admin_*) ya
 * van por server/utils/email/platform.ts. Todo lo demás — lo que la empresa
 * envía a SUS clientes y a SU equipo — sale con el remitente de la empresa.
 */
export const SYSTEM_SENDER_TEMPLATES = new Set(['user_welcome', 'password_reset', 'domain_check_failed', 'domain_check_recovered'])

/** Buzones gratuitos: nadie puede verificar su DNS, así que no sirven como remitente propio. */
export const PERSONAL_MAILBOX_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.es', 'msn.com',
  'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.es', 'gmx.net',
  'proton.me', 'protonmail.com', 'zoho.com', 'mail.com', 'yandex.com', 'telefonica.net', 'terra.es',
])

export class OrgSenderError extends Error {
  constructor(
    public field: string,
    message: string,
    public statusCode = 422,
  ) {
    super(message)
  }
}

export interface EffectiveOrgSender {
  /** 'own' = su dirección (dominio verificado); 'platform' = vía INMO. */
  mode: 'own' | 'platform'
  fromHeader: string
  replyTo: string | null
}

export type SenderDomainStatus = 'verified' | 'pending' | 'not_started' | 'failed' | 'temporary_failure' | 'not_registered' | 'not_connected' | 'error'

export interface OrgSenderView {
  organizationId: number
  senderName: string
  senderAddress: string
  replyTo: string
  internalRecipients: string[]
  effective: EffectiveOrgSender
  platformFrom: string
  providerConnected: boolean
  domain: null | {
    name: string
    status: SenderDomainStatus
    verified: boolean
    records: Array<ResendDnsRecord & { host: string }>
    error: string | null
  }
}

function lower(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

export function emailDomain(address: string): string | null {
  const a = lower(address)
  return EMAIL_RE.test(a) ? a.split('@')[1]! : null
}

/** Cabecera From segura: sin caracteres que rompan la cabecera, y entre comillas si hace falta (RFC 5322). */
export function formatFromHeader(name: string, address: string): string {
  const display = name.replace(/[<>"\r\n]/g, '').trim()
  if (!display) return address
  return /[(),.:;@[\]\\]/.test(display) ? `"${display}" <${address}>` : `${display} <${address}>`
}

function firstEmail(...values: unknown[]): string | null {
  for (const v of values) {
    const e = lower(v)
    if (EMAIL_RE.test(e)) return e
  }
  return null
}

/** Con qué remitente sale HOY un email de esta empresa. */
export function effectiveOrgSender(org: Record<string, any> | null | undefined, env: Record<string, any> = {}): EffectiveOrgSender {
  const platform = platformEmailConfig(env)
  if (!org) return { mode: 'platform', fromHeader: platform.fromHeader, replyTo: null }
  const companyName = String(org.companyName || org.name || '').trim() || platform.fromName
  const senderName = String(org.emailSenderName || '').trim() || companyName
  const own = firstEmail(org.emailSenderAddress)
  if (own && Number(org.emailSenderDomainVerified) === 1) {
    return { mode: 'own', fromHeader: formatFromHeader(senderName, own), replyTo: firstEmail(org.emailReplyTo) }
  }
  return {
    mode: 'platform',
    fromHeader: formatFromHeader(`${senderName} vía ${platform.fromName}`, platform.fromAddress),
    // Que las respuestas de los clientes lleguen a la empresa, no a INMO.
    replyTo: firstEmail(org.emailReplyTo, org.emailSenderAddress, org.legalEmail),
  }
}

/** Por qué este dominio no puede ser el remitente propio de una empresa, o null si puede. */
export function senderDomainProblem(domain: string, env: Record<string, any> = {}): string | null {
  const platformDomain = platformEmailConfig(env).fromAddress.split('@')[1]!.toLowerCase()
  if (domain === platformDomain || domain.endsWith(`.${platformDomain}`) || domain === 'resend.dev' || domain.endsWith('.resend.dev')) {
    return 'Ese dominio es el de la plataforma. Usa una dirección de tu propio dominio (por ejemplo, hola@tuinmobiliaria.es).'
  }
  if (PERSONAL_MAILBOX_DOMAINS.has(domain)) {
    return 'Las direcciones de Gmail, Outlook, Yahoo, iCloud… no pueden ser remitente: sólo el dueño de ese dominio puede verificarlo. Usa una dirección de tu dominio, o pon esta en «Responder a» para recibir las respuestas.'
  }
  return null
}

const ownerKey = (domain: string) => `org:platform:email-domain:${domain}`

export async function emailDomainOwner(db: any, domain: string): Promise<number | null> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, ownerKey(domain))).limit(1)
  const id = Number(row?.value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Reclama el dominio para la empresa; true si es suyo (ya lo era o lo acaba de reclamar). */
async function claimEmailDomain(db: any, domain: string, orgId: number, ts: string): Promise<boolean> {
  await db.insert(schema.settings).values({ key: ownerKey(domain), value: String(orgId), updatedAt: ts }).onConflictDoNothing()
  return (await emailDomainOwner(db, domain)) === orgId
}

function withHosts(domain: ResendDomain): Array<ResendDnsRecord & { host: string }> {
  return domain.records.map((r) => {
    const host = !r.name || r.name === '@' ? domain.name : r.name.endsWith(domain.name) ? r.name : `${r.name}.${domain.name}`
    return { ...r, host }
  })
}

function nowTs() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

async function loadOrg(db: any, orgId: number) {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  if (!org) throw new OrgSenderError('organizationId', 'Empresa no encontrada.', 404)
  return org
}

function parseRecipients(json: unknown): string[] {
  try {
    const list = JSON.parse(String(json || '[]'))
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

/**
 * Estado del dominio en Resend para la vista (y sincroniza
 * emailSenderDomainVerified con lo que Resend dice ahora).
 */
async function resolveDomainState(db: any, env: Record<string, any>, org: any, opts: { register: boolean; verify: boolean }): Promise<OrgSenderView['domain']> {
  const domainName = emailDomain(org.emailSenderAddress || '')
  if (!domainName) return null
  if (!env.RESEND_API_KEY) return { name: domainName, status: 'not_connected', verified: false, records: [], error: 'El envío de emails de la plataforma todavía no está conectado (falta RESEND_API_KEY). La dirección queda guardada; el dominio se registrará en cuanto lo esté.' }

  const found = await findResendDomain(env, domainName)
  if (!found.ok) return { name: domainName, status: 'error', verified: false, records: [], error: providerMessage(found) }
  let domainId = found.domain?.id ?? null
  if (!domainId) {
    if (!opts.register) return { name: domainName, status: 'not_registered', verified: false, records: [], error: null }
    const created = await createResendDomain(env, domainName)
    if (!created.ok) return { name: domainName, status: 'error', verified: false, records: [], error: providerMessage(created) }
    domainId = created.domain.id
  }
  if (opts.verify) {
    const v = await verifyResendDomain(env, domainId)
    if (!v.ok) return { name: domainName, status: 'error', verified: false, records: [], error: providerMessage(v) }
  }
  const got = await getResendDomain(env, domainId)
  if (!got.ok) return { name: domainName, status: 'error', verified: false, records: [], error: providerMessage(got) }
  const verified = got.domain.status === 'verified'
  if (verified !== (Number(org.emailSenderDomainVerified) === 1)) {
    await db.update(schema.organizations).set({ emailSenderDomainVerified: verified ? 1 : 0, emailSenderDomainCheckedAt: nowTs() }).where(eq(schema.organizations.id, org.id))
    org.emailSenderDomainVerified = verified ? 1 : 0
  }
  return { name: domainName, status: (got.domain.status as SenderDomainStatus) || 'pending', verified, records: withHosts(got.domain), error: null }
}

function providerMessage(r: { status: number | null; message: string }): string {
  if (r.status === 401 || r.status === 403) {
    if (/restricted|sending access|permission/i.test(r.message)) return 'La clave de Resend de la plataforma sólo permite enviar: para verificar dominios de empresas necesita «Full access». Avisa a quien administra INMO.'
    if (/limit|plan/i.test(r.message)) return `El plan de Resend de la plataforma no admite más dominios (${r.message}). Avisa a quien administra INMO.`
  }
  return `El proveedor de email respondió: ${r.message}`
}

function view(org: any, env: Record<string, any>, domain: OrgSenderView['domain']): OrgSenderView {
  return {
    organizationId: org.id,
    senderName: org.emailSenderName || '',
    senderAddress: org.emailSenderAddress || '',
    replyTo: org.emailReplyTo || '',
    internalRecipients: parseRecipients(org.emailInternalRecipientsJson),
    effective: effectiveOrgSender(org, env),
    platformFrom: platformEmailConfig(env).fromHeader,
    providerConnected: Boolean(env.RESEND_API_KEY),
    domain,
  }
}

/** Vista del remitente de una empresa (Sistema → Emails / Empresas → ficha → Email). */
export async function orgSenderView(db: any, env: Record<string, any>, orgId: number): Promise<OrgSenderView> {
  const org = await loadOrg(db, orgId)
  return view(org, env, await resolveDomainState(db, env, org, { register: false, verify: false }))
}

export interface SaveOrgSenderInput {
  senderName?: unknown
  senderAddress?: unknown
  replyTo?: unknown
  internalRecipients?: unknown
}

/**
 * Guarda el remitente. Valida todo antes de escribir; si la dirección es de
 * un dominio nuevo, lo reclama para la empresa y lo da de alta en Resend.
 * Devuelve la vista y el detalle para la auditoría.
 */
export async function saveOrgSender(
  db: any,
  env: Record<string, any>,
  orgId: number,
  input: SaveOrgSenderInput,
  actor: { role: string },
): Promise<{ view: OrgSenderView; detail: string }> {
  const org = await loadOrg(db, orgId)
  const senderName = typeof input.senderName === 'string' ? input.senderName.replace(/[<>"\r\n]/g, '').trim().slice(0, 80) : ''
  const senderAddress = lower(input.senderAddress)
  const replyTo = lower(input.replyTo)
  if (senderAddress && !EMAIL_RE.test(senderAddress)) throw new OrgSenderError('senderAddress', 'Introduce una dirección de email válida.')
  if (replyTo && !EMAIL_RE.test(replyTo)) throw new OrgSenderError('replyTo', 'Introduce una dirección de email válida para «Responder a».')
  const recipientsRaw = Array.isArray(input.internalRecipients) ? input.internalRecipients : typeof input.internalRecipients === 'string' ? input.internalRecipients.split(/[\n,;]+/) : parseRecipients(org.emailInternalRecipientsJson)
  const recipients = [...new Set(recipientsRaw.map(lower).filter(Boolean))]
  const badRecipient = recipients.find((r) => !EMAIL_RE.test(r))
  if (badRecipient) throw new OrgSenderError('internalRecipients', `No es un email válido: ${badRecipient}`)
  if (recipients.length > 10) throw new OrgSenderError('internalRecipients', 'Como máximo 10 destinatarios internos.')

  const domainName = senderAddress ? emailDomain(senderAddress) : null
  if (domainName) {
    const problem = senderDomainProblem(domainName, env)
    if (problem) throw new OrgSenderError('senderAddress', problem)
    const owner = await emailDomainOwner(db, domainName)
    if (owner && owner !== orgId) throw new OrgSenderError('senderAddress', 'Ese dominio ya lo usa otra empresa en INMO.', 409)
    if (!owner && env.RESEND_API_KEY && actor.role !== 'super_admin') {
      // Ya estaba en la cuenta de Resend sin dueño en INMO (alta manual): si se
      // asignara al primero que lo pide, podría enviar como el dominio de otro.
      const existing = await findResendDomain(env, domainName)
      if (existing.ok && existing.domain) throw new OrgSenderError('senderAddress', 'Ese dominio ya está dado de alta en la cuenta de email de la plataforma. Pide a soporte de INMO que te lo asigne.', 409)
    }
  }

  // --- escritura ---
  const ts = nowTs()
  if (domainName && !(await claimEmailDomain(db, domainName, orgId, ts))) {
    throw new OrgSenderError('senderAddress', 'Ese dominio ya lo usa otra empresa en INMO.', 409)
  }
  const previousAddress = org.emailSenderAddress || ''
  const sameDomain = emailDomain(previousAddress) === domainName
  const patch = {
    emailSenderName: senderName || null,
    emailSenderAddress: senderAddress || null,
    emailReplyTo: replyTo || null,
    emailInternalRecipientsJson: JSON.stringify(recipients),
    // Otro dominio (o ninguno) = sin verificar hasta que Resend diga lo contrario.
    ...(sameDomain ? {} : { emailSenderDomainVerified: 0, emailSenderDomainCheckedAt: null }),
    updatedAt: ts,
  }
  await db.update(schema.organizations).set(patch).where(eq(schema.organizations.id, orgId))
  Object.assign(org, patch)

  const domain = await resolveDomainState(db, env, org, { register: true, verify: false })
  const parts: string[] = []
  if (previousAddress !== (senderAddress || '')) parts.push(`remitente de email: ${previousAddress || '(plataforma)'} → ${senderAddress || '(plataforma)'}`)
  if (domain) parts.push(`dominio ${domain.name}: ${domain.status}`)
  return { view: view(org, env, domain), detail: parts.join('; ') || 'remitente de email actualizado' }
}

/** «Comprobar ahora»: pide a Resend que mire el DNS y devuelve el estado real. */
export async function verifyOrgSender(db: any, env: Record<string, any>, orgId: number): Promise<{ view: OrgSenderView; detail: string }> {
  const org = await loadOrg(db, orgId)
  const domainName = emailDomain(org.emailSenderAddress || '')
  if (!domainName) throw new OrgSenderError('senderAddress', 'Guarda primero una dirección de tu dominio.')
  if ((await emailDomainOwner(db, domainName)) !== orgId) throw new OrgSenderError('senderAddress', 'Ese dominio no está asignado a esta empresa. Guarda de nuevo la dirección.', 409)
  const domain = await resolveDomainState(db, env, org, { register: true, verify: true })
  return { view: view(org, env, domain), detail: `verificación del dominio ${domainName}: ${domain?.status ?? '—'}` }
}

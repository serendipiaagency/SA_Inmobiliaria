/**
 * Remitente central de la plataforma (Portal INMO <info@serendipiaagency.com>
 * por defecto). Módulo sin dependencias para que lo usen tanto el email de
 * plataforma (platform.ts) como el remitente de cada empresa cuando todavía no
 * tiene dominio propio verificado (orgSender.ts). Ver docs/empresas.md.
 */

export const PLATFORM_EMAIL_DEFAULTS = {
  fromName: 'Portal INMO',
  fromAddress: 'info@serendipiaagency.com',
  /** El del bloque «¿Hablamos?» de la plantilla maestra (master.ts). */
  contactAddress: 'info@serendipiaagency.com',
} as const

export interface PlatformEmailConfig {
  fromName: string
  fromAddress: string
  fromHeader: string
  replyTo: string
  contactAddress: string
}

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function platformEmailConfig(env: Record<string, any> = {}): PlatformEmailConfig {
  const fromName = clean(env.PLATFORM_EMAIL_FROM_NAME).replace(/[<>"]/g, '') || PLATFORM_EMAIL_DEFAULTS.fromName
  const configuredFrom = clean(env.PLATFORM_EMAIL_FROM_ADDRESS)
  const fromAddress = EMAIL_RE.test(configuredFrom) ? configuredFrom : PLATFORM_EMAIL_DEFAULTS.fromAddress
  const configuredReply = clean(env.PLATFORM_EMAIL_REPLY_TO)
  const replyTo = EMAIL_RE.test(configuredReply) ? configuredReply : fromAddress
  const configuredContact = clean(env.PLATFORM_EMAIL_CONTACT)
  const contactAddress = EMAIL_RE.test(configuredContact) ? configuredContact : PLATFORM_EMAIL_DEFAULTS.contactAddress
  return { fromName, fromAddress, fromHeader: `${fromName} <${fromAddress}>`, replyTo, contactAddress }
}


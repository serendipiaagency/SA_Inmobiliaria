import { inArray, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { renderEmailLayout, type EmailLocale, type EmailOrgBranding } from './layout'
import { greetingNameOf, renderMasterEmail } from './master'
import { TEMPLATES, type TemplateKey } from './templates'

/**
 * El único punto donde un template se convierte en HTML. Los emails propios de
 * Portal INMO (los que tienen `master`) salen con la plantilla maestra; los
 * que una inmobiliaria manda a sus clientes, con su marca (layout.ts).
 */

/** ¿Es un email propio de Portal INMO (plantilla maestra y remitente de la plataforma)? */
export function isPortalInmoTemplate(key: TemplateKey): boolean {
  return Boolean(TEMPLATES[key]?.master)
}

export const PORTAL_INMO_TEMPLATES = (Object.keys(TEMPLATES) as TemplateKey[]).filter(isPortalInmoTemplate)

export interface RenderEmailContext {
  /** Marca de la empresa: sólo la usan los emails de la inmobiliaria a sus clientes. */
  branding: EmailOrgBranding
  /** Correo del bloque «¿Hablamos?» de la plantilla maestra. */
  contactEmail: string
  /** Nombre del destinatario para el saludo, si el template no trae uno. */
  recipientName?: string | null
  unsubscribeUrl?: string | null
}

export function renderTemplateEmail(key: TemplateKey, data: Record<string, any>, locale: EmailLocale, ctx: RenderEmailContext): { subject: string; html: string } {
  const template = TEMPLATES[key]
  const subject = template.subject(data, locale)
  if (template.master) {
    const content = template.master(data, locale)
    const greetingName = greetingNameOf(content.greetingName) ?? greetingNameOf(ctx.recipientName)
    return { subject, html: renderMasterEmail({ ...content, greetingName }, { locale, subject, contactEmail: ctx.contactEmail }) }
  }
  return {
    subject,
    html: renderEmailLayout({
      branding: ctx.branding,
      locale,
      title: subject,
      bodyHtml: template.body!(data, locale),
      kind: template.kind,
      unsubscribeUrl: template.kind === 'commercial' ? ctx.unsubscribeUrl : null,
    }),
  }
}

/**
 * Nombre de la cuenta de cada dirección, para «Hola, {nombre}:» en los emails
 * propios de Portal INMO (avisos al equipo, al super admin…). Una dirección sin
 * cuenta queda fuera y el saludo cae en «Hola:».
 */
export async function recipientNames(db: any, emails: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const out = new Map<string, string>()
  if (!wanted.length) return out
  const rows = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(inArray(sql`lower(${schema.users.email})`, wanted))
  for (const r of rows as Array<{ email: string; name: string | null }>) {
    const name = greetingNameOf(r.name)
    if (name) out.set(r.email.toLowerCase(), name)
  }
  return out
}

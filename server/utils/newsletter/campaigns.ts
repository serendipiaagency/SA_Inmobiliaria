import { and, desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from '../db'
import { renderEmailLayout, emailHeading, emailParagraph, emailButton, escapeHtml } from '../email/layout'
import type { EmailOrgBranding } from '../email/layout'

/**
 * Newsletter: plantillas y campañas que la agencia redacta con el editor
 * (tablas de la migración 0100). NO envían nada: el envío masivo real no
 * existe todavía (decisión del propietario). Una campaña se redacta, se
 * previsualiza como email con la marca de la agencia y se EXPORTA (su HTML y
 * la lista de suscriptores) para enviarla con la herramienta de la agencia.
 *
 * El contenido es una lista de bloques sencillos y seguros para email
 * (encabezado, párrafo, botón, imagen); se renderizan con el mismo layout de
 * email del resto de la plataforma (tablas + estilos en línea), así el
 * boletín se ve igual en todos los clientes y con la marca de la empresa.
 */

export type NewsletterBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'image'; src: string; alt?: string }

const MAX_BLOCKS = 100
const MAX_TEXT = 5000
const clampText = (v: unknown, max = MAX_TEXT) => String(v ?? '').slice(0, max)

function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

/** La marca de la agencia para pintar el boletín (nombre, logo, color), igual que la identidad de sus emails. */
export async function orgBranding(db: any, orgIdInput: number | null): Promise<EmailOrgBranding> {
  const orgId = requireOrgId(orgIdInput)
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  return { companyName: org?.companyName || org?.name || 'Tu inmobiliaria', logo: org?.logo || null, brandColor: org?.brandColor || null }
}

/** Sanea y acota la lista de bloques del editor; descarta lo que no reconoce. */
export function normalizeBlocks(value: unknown): NewsletterBlock[] {
  const arr = Array.isArray(value) ? value : []
  const out: NewsletterBlock[] = []
  for (const raw of arr.slice(0, MAX_BLOCKS)) {
    const t = (raw as any)?.type
    if (t === 'heading') out.push({ type: 'heading', text: clampText((raw as any).text, 300) })
    else if (t === 'paragraph') out.push({ type: 'paragraph', text: clampText((raw as any).text) })
    else if (t === 'button') {
      const url = clampText((raw as any).url, 2000).trim()
      // Sólo enlaces http(s) o mailto: nada de javascript: ni data: en un email.
      if (/^(https?:\/\/|mailto:)/i.test(url)) out.push({ type: 'button', label: clampText((raw as any).label, 120) || 'Ver más', url })
    } else if (t === 'image') {
      const src = clampText((raw as any).src, 2000).trim()
      if (/^https?:\/\//i.test(src)) out.push({ type: 'image', src, alt: clampText((raw as any).alt, 200) })
    }
  }
  return out
}

/** Un bloque → HTML de email (estilos en línea, seguro). */
function blockHtml(block: NewsletterBlock, accent: string | null | undefined): string {
  switch (block.type) {
    case 'heading':
      return emailHeading(block.text)
    case 'paragraph':
      // Texto plano: se escapa y los saltos de línea se vuelven <br>.
      return emailParagraph(escapeHtml(block.text).replace(/\r?\n/g, '<br>'))
    case 'button':
      return emailButton(block.label, block.url, accent)
    case 'image':
      return `<img src="${escapeHtml(block.src).replace(/"/g, '&quot;')}" alt="${escapeHtml(block.alt || '')}" style="max-width:100%;height:auto;display:block;border-radius:8px;margin:0 0 16px;">`
    default:
      return ''
  }
}

/**
 * El boletín como email completo, con la marca de la agencia. Lleva el pie
 * «commercial» con el enlace de baja: como el envío es externo, se deja el
 * marcador `{{unsubscribe}}` para que la herramienta de envío lo sustituya por
 * el enlace de baja de cada destinatario (nunca se envía sin opción de baja).
 */
export function renderNewsletterHtml(blocks: NewsletterBlock[], opts: { branding: EmailOrgBranding; subject: string; locale?: 'es' | 'en' }): string {
  const accent = opts.branding.brandColor || null
  const bodyHtml = blocks.map((b) => blockHtml(b, accent)).join('\n') || emailParagraph('(Sin contenido todavía)')
  return renderEmailLayout({
    branding: opts.branding,
    locale: opts.locale === 'en' ? 'en' : 'es',
    title: opts.subject || opts.branding.companyName,
    bodyHtml,
    kind: 'commercial',
    unsubscribeUrl: '{{unsubscribe}}',
  })
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

export interface TemplateRow {
  id: number
  name: string
  subject: string
  blocks: NewsletterBlock[]
  createdAt: string
  updatedAt: string
}

const rowToTemplate = (r: any): TemplateRow => ({ id: r.id, name: r.name, subject: r.subject, blocks: safeBlocks(r.contentJson), createdAt: r.createdAt, updatedAt: r.updatedAt })

function safeBlocks(json: unknown): NewsletterBlock[] {
  if (typeof json !== 'string' || !json) return []
  try {
    return normalizeBlocks(JSON.parse(json))
  } catch {
    return []
  }
}

export async function listTemplates(db: any, orgIdInput: number | null): Promise<TemplateRow[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select()
    .from(schema.newsletterTemplates)
    .where(eq(schema.newsletterTemplates.organizationId, orgId))
    .orderBy(desc(schema.newsletterTemplates.updatedAt), desc(schema.newsletterTemplates.id))
    .limit(500)
  return rows.map(rowToTemplate)
}

export async function createTemplate(db: any, orgIdInput: number | null, input: { name?: unknown; subject?: unknown; blocks?: unknown }, userId: number | null): Promise<TemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const name = clampText(input.name, 120).trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la plantilla' })
  const ts = now()
  const [row] = await db
    .insert(schema.newsletterTemplates)
    .values({ organizationId: orgId, name, subject: clampText(input.subject, 200).trim(), contentJson: JSON.stringify(normalizeBlocks(input.blocks)), createdBy: userId ?? null, createdAt: ts, updatedAt: ts })
    .returning()
  return rowToTemplate(row)
}

export async function updateTemplate(db: any, orgIdInput: number | null, id: number, input: { name?: unknown; subject?: unknown; blocks?: unknown }): Promise<TemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterTemplates.organizationId, orgId), eq(schema.newsletterTemplates.id, id))
  const [existing] = await db.select().from(schema.newsletterTemplates).where(where).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  const patch: Record<string, unknown> = { updatedAt: now() }
  if (input.name !== undefined) {
    const name = clampText(input.name, 120).trim()
    if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la plantilla' })
    patch.name = name
  }
  if (input.subject !== undefined) patch.subject = clampText(input.subject, 200).trim()
  if (input.blocks !== undefined) patch.contentJson = JSON.stringify(normalizeBlocks(input.blocks))
  await db.update(schema.newsletterTemplates).set(patch).where(where)
  const [row] = await db.select().from(schema.newsletterTemplates).where(where).limit(1)
  return rowToTemplate(row)
}

export async function deleteTemplate(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterTemplates.organizationId, orgId), eq(schema.newsletterTemplates.id, id))
  const [row] = await db.select({ id: schema.newsletterTemplates.id }).from(schema.newsletterTemplates).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  await db.delete(schema.newsletterTemplates).where(where)
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

export type CampaignStatus = 'draft' | 'ready' | 'exported'
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'ready', 'exported']

export interface CampaignRow {
  id: number
  name: string
  subject: string
  blocks: NewsletterBlock[]
  status: CampaignStatus
  segment: string
  recipientCount: number | null
  lastExportedAt: string | null
  createdAt: string
  updatedAt: string
}

const rowToCampaign = (r: any): CampaignRow => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  blocks: safeBlocks(r.contentJson),
  status: (CAMPAIGN_STATUSES as string[]).includes(r.status) ? r.status : 'draft',
  segment: r.segment,
  recipientCount: r.recipientCount ?? null,
  lastExportedAt: r.lastExportedAt ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

export async function listCampaigns(db: any, orgIdInput: number | null): Promise<CampaignRow[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select()
    .from(schema.newsletterCampaigns)
    .where(eq(schema.newsletterCampaigns.organizationId, orgId))
    .orderBy(desc(schema.newsletterCampaigns.createdAt), desc(schema.newsletterCampaigns.id))
    .limit(500)
  return rows.map(rowToCampaign)
}

export async function getCampaign(db: any, orgIdInput: number | null, id: number): Promise<CampaignRow> {
  const orgId = requireOrgId(orgIdInput)
  const [row] = await db
    .select()
    .from(schema.newsletterCampaigns)
    .where(and(eq(schema.newsletterCampaigns.organizationId, orgId), eq(schema.newsletterCampaigns.id, id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaña no encontrada' })
  return rowToCampaign(row)
}

export async function createCampaign(db: any, orgIdInput: number | null, input: { name?: unknown; subject?: unknown; blocks?: unknown }, userId: number | null): Promise<CampaignRow> {
  const orgId = requireOrgId(orgIdInput)
  const name = clampText(input.name, 120).trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la campaña' })
  const ts = now()
  const [row] = await db
    .insert(schema.newsletterCampaigns)
    .values({ organizationId: orgId, name, subject: clampText(input.subject, 200).trim(), contentJson: JSON.stringify(normalizeBlocks(input.blocks)), status: 'draft', segment: 'subscribed', createdBy: userId ?? null, createdAt: ts, updatedAt: ts })
    .returning()
  return rowToCampaign(row)
}

export async function updateCampaign(db: any, orgIdInput: number | null, id: number, input: { name?: unknown; subject?: unknown; blocks?: unknown; status?: unknown }): Promise<CampaignRow> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterCampaigns.organizationId, orgId), eq(schema.newsletterCampaigns.id, id))
  const [existing] = await db.select().from(schema.newsletterCampaigns).where(where).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Campaña no encontrada' })
  const patch: Record<string, unknown> = { updatedAt: now() }
  if (input.name !== undefined) {
    const name = clampText(input.name, 120).trim()
    if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la campaña' })
    patch.name = name
  }
  if (input.subject !== undefined) patch.subject = clampText(input.subject, 200).trim()
  if (input.blocks !== undefined) patch.contentJson = JSON.stringify(normalizeBlocks(input.blocks))
  // Sólo draft ↔ ready a mano; 'exported' lo pone la exportación.
  if (input.status !== undefined && (input.status === 'draft' || input.status === 'ready')) patch.status = input.status
  await db.update(schema.newsletterCampaigns).set(patch).where(where)
  const [row] = await db.select().from(schema.newsletterCampaigns).where(where).limit(1)
  return rowToCampaign(row)
}

export async function deleteCampaign(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.newsletterCampaigns.organizationId, orgId), eq(schema.newsletterCampaigns.id, id))
  const [row] = await db.select({ id: schema.newsletterCampaigns.id }).from(schema.newsletterCampaigns).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaña no encontrada' })
  await db.delete(schema.newsletterCampaigns).where(where)
}

/** Los emails de los suscriptores activos (para exportar y enviar fuera). */
export async function subscribedEmails(db: any, orgIdInput: number | null): Promise<string[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select({ email: schema.newsletterSubscriptions.email })
    .from(schema.newsletterSubscriptions)
    .where(and(eq(schema.newsletterSubscriptions.organizationId, orgId), eq(schema.newsletterSubscriptions.status, 'subscribed')))
    .orderBy(schema.newsletterSubscriptions.email)
  return rows.map((r: { email: string }) => r.email)
}

/** Marca la campaña como exportada y guarda a cuántos suscriptores fue. */
export async function markCampaignExported(db: any, orgIdInput: number | null, id: number, recipientCount: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const ts = now()
  await db
    .update(schema.newsletterCampaigns)
    .set({ status: 'exported', recipientCount, lastExportedAt: ts, updatedAt: ts })
    .where(and(eq(schema.newsletterCampaigns.organizationId, orgId), eq(schema.newsletterCampaigns.id, id)))
}

/** CSV de destinatarios (una columna «Email»), mismo formato Excel-ES y anti-fórmula que el de suscriptores. */
export function recipientsCsv(emails: string[]): string {
  const cell = (v: string) => {
    let s = String(v ?? '')
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + ['Email', ...emails].map(cell).join('\r\n')
}

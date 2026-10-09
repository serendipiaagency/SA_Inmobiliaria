import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'
import { getOrCreateSitePage, publishPage } from './sitePages'
import { FOOTER_PAGE_KEY, normalizeFooterConfig, socialLinksFromBrandKit, type FooterAvailability, type FooterConfig, type FooterProfile } from '../../utils/siteFooter'
import { SITE_PAGE_KEYS } from '../../utils/siteBuilder/pages'

/**
 * El pie global de la web (utils/siteFooter.ts) en la base de datos: un
 * documento de `site_pages` con la clave reservada `footer`, así que tiene
 * borrador (lo que edita el Constructor), versión publicada (lo que ve la
 * web) e historial de versiones como cualquier página. Todo por
 * organización: cada lectura y escritura va filtrada por su orgId, que llega
 * siempre de requireOrgScope (panel) o resolvePublicOrgId (web).
 *
 * El JSON guardado es `{ "footer": FooterConfig }`. Sin fila, o sin versión
 * publicada, la web pinta el pie de partida.
 */

const MAX_FOOTER_BYTES = 64 * 1024

function parseFooterJson(json: string | null | undefined): FooterConfig {
  if (!json) return normalizeFooterConfig(null)
  try {
    return normalizeFooterConfig(JSON.parse(json)?.footer)
  } catch {
    return normalizeFooterConfig(null)
  }
}

function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

/** Lo que llega del editor, normalizado; 413 si es desproporcionado. */
export function validateFooterConfig(input: unknown): FooterConfig {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>).footer ?? input : input
  const config = normalizeFooterConfig(raw)
  if (JSON.stringify(config).length > MAX_FOOTER_BYTES) throw createError({ statusCode: 413, statusMessage: 'Pie demasiado grande' })
  return config
}

export interface FooterDraftState {
  config: FooterConfig
  /** Hay un pie publicado (si no, la web enseña el de partida). */
  published: boolean
  version: number
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

/** Panel: el borrador del pie (y si difiere de lo publicado). */
export async function getFooterDraft(db: any, orgId: number | null): Promise<FooterDraftState> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), FOOTER_PAGE_KEY)
  const config = parseFooterJson(row.draftJson)
  const published = row.publishedJson != null
  return {
    config,
    published,
    version: row.version || 0,
    publishedAt: row.publishedAt ?? null,
    // Comparando lo normalizado: un borrador recién creado (sin «footer») y
    // nada publicado son el mismo pie de partida, no «cambios».
    hasUnpublishedChanges: JSON.stringify(config) !== JSON.stringify(parseFooterJson(row.publishedJson)),
  }
}

/** Autoguardado del editor: sólo el borrador. */
export async function saveFooterDraft(db: any, orgId: number | null, config: FooterConfig): Promise<void> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), FOOTER_PAGE_KEY)
  await db
    .update(schema.sitePages)
    .set({ draftJson: JSON.stringify({ footer: config }), updatedAt: now() })
    .where(and(eq(schema.sitePages.organizationId, row.organizationId), eq(schema.sitePages.pageKey, FOOTER_PAGE_KEY)))
}

/** Publicar: el borrador pasa a la web y queda una versión en el historial. */
export async function publishFooter(db: any, orgId: number | null, userId: number): Promise<number> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), FOOTER_PAGE_KEY)
  // Un borrador que nunca se tocó es la siembra de site_pages, sin «footer»:
  // se publica el pie de partida explícito, no un documento vacío.
  if (!row.draftJson?.includes('"footer"')) await saveFooterDraft(db, orgId, parseFooterJson(row.draftJson))
  return publishPage(db, orgId, FOOTER_PAGE_KEY, userId)
}

/** Web: sólo lo publicado (nunca el borrador); sin publicar, el pie de partida. */
export async function getPublishedFooter(db: any, orgId: number | null): Promise<FooterConfig> {
  const rows = await db
    .select({ publishedJson: schema.sitePages.publishedJson })
    .from(schema.sitePages)
    .where(and(eq(schema.sitePages.organizationId, requireOrgId(orgId)), eq(schema.sitePages.pageKey, FOOTER_PAGE_KEY)))
    .limit(1)
  return parseFooterJson(rows[0]?.publishedJson)
}

/**
 * Los datos de la empresa que el pie usa cuando no se escriben a mano: el
 * teléfono (Brand Kit → teléfono legal → oficina principal), la ciudad y la
 * dirección de la oficina principal (la primera activa) y las redes del
 * Brand Kit con URL válida de su red. Si no hay, null: el pie oculta ese
 * bloque en vez de inventarlo.
 */
export async function loadFooterProfile(db: any, orgId: number | null): Promise<FooterProfile> {
  const id = requireOrgId(orgId)
  const [kitRows, orgRows, officeRows] = await Promise.all([
    db.select({ phone: schema.brandKits.phone, socialLinksJson: schema.brandKits.socialLinksJson }).from(schema.brandKits).where(eq(schema.brandKits.organizationId, id)).limit(1),
    db.select({ legalPhone: schema.organizations.legalPhone }).from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1),
    db
      .select({ phone: schema.offices.phone, address: schema.offices.address, city: schema.offices.city, province: schema.offices.province, postalCode: schema.offices.postalCode })
      .from(schema.offices)
      .where(and(eq(schema.offices.organizationId, id), eq(schema.offices.status, 'active'), isNull(schema.offices.deletedAt)))
      .orderBy(asc(schema.offices.id))
      .limit(1),
  ])
  const kit = kitRows[0]
  const office = officeRows[0]
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const city = clean(office?.city)
  const province = clean(office?.province)
  const location = [city, province && province !== city ? province : null].filter(Boolean).join(', ') || null
  const mapQuery = office ? [clean(office.address), clean(office.postalCode), city, province].filter(Boolean).join(', ') || null : null
  return {
    phone: clean(kit?.phone) || clean(orgRows[0]?.legalPhone) || clean(office?.phone),
    location,
    mapQuery,
    social: socialLinksFromBrandKit(kit?.socialLinksJson),
  }
}

/** Qué páginas del Constructor tienen versión publicada (Servicios sólo existe así). */
export async function loadFooterAvailability(db: any, orgId: number | null): Promise<FooterAvailability> {
  const rows = await db
    .select({ pageKey: schema.sitePages.pageKey })
    .from(schema.sitePages)
    .where(and(eq(schema.sitePages.organizationId, requireOrgId(orgId)), isNotNull(schema.sitePages.publishedJson)))
  return { publishedPages: rows.map((r: any) => r.pageKey as string).filter((k: string) => SITE_PAGE_KEYS.includes(k)) }
}

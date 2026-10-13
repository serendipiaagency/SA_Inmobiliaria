import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'
import { getOrCreateSitePage, publishPage } from './sitePages'
import { isDemoOrg } from './demo/tenant'
import { CONSENT_PAGE_KEY, normalizeSiteConsent, type ConsentProfile, type SiteConsentConfig } from '../../utils/siteConsent'

/**
 * La presentación del aviso de cookies y del aviso de demostración
 * (utils/siteConsent.ts) en la base de datos: un documento de `site_pages`
 * con la clave reservada `consent`, con borrador (lo que edita el
 * Constructor), versión publicada (lo que ve la web) e historial, como el
 * pie (`footer`). Todo por organización: cada lectura y escritura va
 * filtrada por su orgId, que llega de requireOrgScope (panel) o
 * resolvePublicOrgId (web).
 *
 * El JSON guardado es `{ "consent": SiteConsentConfig }`. Sin fila, o sin
 * versión publicada, la web pinta los avisos de partida.
 */

const MAX_CONSENT_BYTES = 96 * 1024

function parseConsentJson(json: string | null | undefined): SiteConsentConfig {
  if (!json) return normalizeSiteConsent(null)
  try {
    return normalizeSiteConsent(JSON.parse(json)?.consent)
  } catch {
    return normalizeSiteConsent(null)
  }
}

function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

/** Lo que llega del editor, normalizado; 413 si es desproporcionado. */
export function validateSiteConsent(input: unknown): SiteConsentConfig {
  const raw = input && typeof input === 'object' ? ((input as Record<string, unknown>).consent ?? input) : input
  const config = normalizeSiteConsent(raw)
  if (JSON.stringify(config).length > MAX_CONSENT_BYTES) throw createError({ statusCode: 413, statusMessage: 'Configuración demasiado grande' })
  return config
}

export interface ConsentDraftState {
  config: SiteConsentConfig
  published: boolean
  version: number
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

/** Panel: el borrador (y si difiere de lo publicado). */
export async function getConsentDraft(db: any, orgId: number | null): Promise<ConsentDraftState> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), CONSENT_PAGE_KEY)
  const config = parseConsentJson(row.draftJson)
  return {
    config,
    published: row.publishedJson != null,
    version: row.version || 0,
    publishedAt: row.publishedAt ?? null,
    // Comparando lo normalizado: un borrador recién creado y nada publicado son los avisos de partida, no «cambios».
    hasUnpublishedChanges: JSON.stringify(config) !== JSON.stringify(parseConsentJson(row.publishedJson)),
  }
}

/** Autoguardado del editor: sólo el borrador. */
export async function saveConsentDraft(db: any, orgId: number | null, config: SiteConsentConfig): Promise<void> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), CONSENT_PAGE_KEY)
  await db
    .update(schema.sitePages)
    .set({ draftJson: JSON.stringify({ consent: config }), updatedAt: now() })
    .where(and(eq(schema.sitePages.organizationId, row.organizationId), eq(schema.sitePages.pageKey, CONSENT_PAGE_KEY)))
}

/** Publicar: el borrador pasa a la web y queda una versión en el historial. */
export async function publishConsent(db: any, orgId: number | null, userId: number): Promise<number> {
  const row = await getOrCreateSitePage(db, requireOrgId(orgId), CONSENT_PAGE_KEY)
  // Un borrador que nunca se tocó es la siembra de site_pages, sin «consent»: se publica la configuración de partida explícita.
  if (!row.draftJson?.includes('"consent"')) await saveConsentDraft(db, orgId, parseConsentJson(row.draftJson))
  return publishPage(db, orgId, CONSENT_PAGE_KEY, userId)
}

/** Web: sólo lo publicado (nunca el borrador); sin publicar, los avisos de partida. */
export async function getPublishedConsent(db: any, orgId: number | null): Promise<SiteConsentConfig> {
  const rows = await db
    .select({ publishedJson: schema.sitePages.publishedJson })
    .from(schema.sitePages)
    .where(and(eq(schema.sitePages.organizationId, requireOrgId(orgId)), eq(schema.sitePages.pageKey, CONSENT_PAGE_KEY)))
    .limit(1)
  return parseConsentJson(rows[0]?.publishedJson)
}

/**
 * Lo que el aviso usa de la empresa sin que nadie lo escriba: el logo (Brand
 * Kit → isotipo → el de la empresa), el color de marca, el nombre y qué datos
 * legales faltan en su ficha (la web los pone «por confirmar»; el panel lo
 * avisa). Nada se inventa: sin logo, el aviso no enseña logo.
 */
export async function loadConsentProfile(db: any, orgId: number | null): Promise<ConsentProfile> {
  const id = requireOrgId(orgId)
  const [kitRows, orgRows, demo] = await Promise.all([
    db.select({ logo: schema.brandKits.logo, isotype: schema.brandKits.isotype, colorPrimary: schema.brandKits.colorPrimary }).from(schema.brandKits).where(eq(schema.brandKits.organizationId, id)).limit(1),
    db
      .select({
        name: schema.organizations.name,
        companyName: schema.organizations.companyName,
        logo: schema.organizations.logo,
        brandColor: schema.organizations.brandColor,
        legalCompanyName: schema.organizations.legalCompanyName,
        taxId: schema.organizations.taxId,
        legalAddress: schema.organizations.legalAddress,
        legalEmail: schema.organizations.legalEmail,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .limit(1),
    isDemoOrg(db, id).catch(() => false),
  ])
  const kit = kitRows[0]
  const org = orgRows[0]
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const legalMissing: ConsentProfile['legalMissing'] = []
  if (!clean(org?.legalCompanyName)) legalMissing.push('legalCompanyName')
  if (!clean(org?.taxId)) legalMissing.push('taxId')
  if (!clean(org?.legalAddress)) legalMissing.push('legalAddress')
  if (!clean(org?.legalEmail)) legalMissing.push('legalEmail')
  return {
    logo: clean(kit?.logo) || clean(kit?.isotype) || clean(org?.logo),
    brandColor: clean(org?.brandColor) || clean(kit?.colorPrimary),
    companyName: clean(org?.companyName) || clean(org?.name) || '',
    legalMissing,
    isDemo: Boolean(demo),
  }
}

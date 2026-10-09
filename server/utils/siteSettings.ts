import { eq, sql } from 'drizzle-orm'
import { schema, now } from './db'
import { NO_COOKIE_PROVIDERS, type CookieProviders } from '../../utils/cookieConsent'

/**
 * Ajustes de la web pública que no son diseño (tabla site_settings,
 * migración 0092): hoy, los proveedores sujetos al aviso de cookies de cada
 * agencia. Sin fila = sin proveedores.
 */

export async function getCookieProviders(db: any, orgId: number): Promise<CookieProviders> {
  const rows = await db
    .select({ ga4: schema.siteSettings.ga4MeasurementId, metaPixel: schema.siteSettings.metaPixelId, revision: schema.siteSettings.consentRevision })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.organizationId, orgId))
    .limit(1)
  const row = rows[0]
  return row ? { ga4: row.ga4 || null, metaPixel: row.metaPixel || null, revision: Number(row.revision) || 0 } : NO_COOKIE_PROVIDERS
}

// La CSP de cada página pública necesita saber si su agencia usa Google
// Analytics o el píxel (security-headers.ts). Una lectura por petición sería
// excesiva: se guarda un minuto por organización en este aislado. Al guardar
// en el panel se invalida aquí; otros aislados lo ven como mucho un minuto
// tarde, y en ese minuto el script sigue sin poder cargarse — nunca al revés.
const CACHE_TTL_MS = 60_000
const cache = new Map<number, { at: number; providers: CookieProviders }>()

export async function cachedCookieProviders(db: any, orgId: number): Promise<CookieProviders> {
  const hit = cache.get(orgId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.providers
  const providers = await getCookieProviders(db, orgId)
  cache.set(orgId, { at: Date.now(), providers })
  return providers
}

export function forgetCookieProviders(orgId: number) {
  cache.delete(orgId)
}

export async function saveCookieProviders(
  db: any,
  orgId: number,
  userId: number,
  input: { ga4: string | null; metaPixel: string | null; askAgain: boolean },
): Promise<CookieProviders> {
  const at = now()
  await db
    .insert(schema.siteSettings)
    .values({ organizationId: orgId, ga4MeasurementId: input.ga4, metaPixelId: input.metaPixel, consentRevision: input.askAgain ? 1 : 0, updatedBy: userId, updatedAt: at })
    .onConflictDoUpdate({
      target: schema.siteSettings.organizationId,
      set: {
        ga4MeasurementId: input.ga4,
        metaPixelId: input.metaPixel,
        consentRevision: input.askAgain ? sql`${schema.siteSettings.consentRevision} + 1` : schema.siteSettings.consentRevision,
        updatedBy: userId,
        updatedAt: at,
      },
    })
  forgetCookieProviders(orgId)
  return getCookieProviders(db, orgId)
}

/** Orígenes que la CSP de la web pública abre sólo si la agencia usa ese proveedor. */
export function cspOriginsForProviders(p: CookieProviders): { script: string[]; connect: string[]; img: string[] } {
  const script: string[] = []
  const connect: string[] = []
  const img: string[] = []
  if (p.ga4) {
    script.push('https://www.googletagmanager.com')
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com')
    img.push('https://*.google-analytics.com', 'https://www.googletagmanager.com')
  }
  if (p.metaPixel) {
    script.push('https://connect.facebook.net')
    connect.push('https://www.facebook.com', 'https://connect.facebook.net')
    img.push('https://www.facebook.com')
  }
  return { script, connect, img }
}

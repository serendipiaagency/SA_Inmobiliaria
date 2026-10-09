/**
 * Consentimiento de cookies de la web pública (aviso «Tu privacidad es
 * importante»): categorías, versión de la política y el registro que se guarda
 * en el navegador del visitante. Lo comparten el aviso
 * (components/CookieConsent.vue), el estado (composables/useCookieConsent.ts),
 * la carga de proveedores (plugins/consent-scripts.client.ts), la página
 * /cookies y las pruebas.
 *
 * Las categorías son las de las tecnologías que la web usa DE VERDAD:
 *  - Necesarias (siempre): idioma, moneda, favoritos y comparador en el propio
 *    navegador, la propia elección sobre cookies.
 *  - Analíticas: el recuento de visitas por visitante (`sa_visitor`), el origen
 *    de la visita para atribuir una consulta (`sa_ft`) y Google Analytics 4 si
 *    la agencia lo configuró.
 *  - Contenido de terceros: vídeos de YouTube/Vimeo y publicaciones de
 *    Instagram/TikTok incrustados.
 *  - Publicidad: sólo existe si la agencia configuró un píxel de Meta.
 */

export const COOKIE_CONSENT_STORAGE_KEY = 'inmo_cookie_consent'

/**
 * Sube cuando cambia el texto o las categorías de la política para todas las
 * webs: el consentimiento guardado con otra versión deja de valer y el aviso
 * vuelve a salir.
 */
export const COOKIE_POLICY_VERSION = 1

export type OptionalCookieCategory = 'analytics' | 'thirdParty' | 'marketing'
export const OPTIONAL_COOKIE_CATEGORIES: OptionalCookieCategory[] = ['analytics', 'thirdParty', 'marketing']

/** Lo que la agencia configuró (Constructor Web → Cookies). IDs públicos, no secretos. */
export interface CookieProviders {
  ga4: string | null
  metaPixel: string | null
  /** Sube cuando la agencia pide volver a solicitar el consentimiento. */
  revision: number
}

export const NO_COOKIE_PROVIDERS: CookieProviders = { ga4: null, metaPixel: null, revision: 0 }

export type CookieChoices = Record<OptionalCookieCategory, boolean>

export interface ConsentRecord {
  /** Versión de la política con la que se decidió (consentVersion). */
  v: string
  /** Organización de la web: en el dominio principal varias webs comparten origen. */
  org: number
  c: CookieChoices
  /** Cuándo se decidió (ISO). */
  at: string
}

/**
 * Versión efectiva de la política de una web: la base, qué proveedores
 * opcionales tiene y la revisión de la agencia. Añadir o quitar Google
 * Analytics o el píxel cambia lo que se pide, así que vuelve a preguntar.
 */
export function consentVersion(p: CookieProviders): string {
  return `${COOKIE_POLICY_VERSION}.${p.ga4 ? 'g' : ''}${p.metaPixel ? 'm' : ''}.${Math.max(0, Math.trunc(p.revision || 0))}`
}

/** Categorías opcionales que esta web enseña: Publicidad sólo si hay píxel. */
export function availableCategories(p: CookieProviders): OptionalCookieCategory[] {
  return p.metaPixel ? ['analytics', 'thirdParty', 'marketing'] : ['analytics', 'thirdParty']
}

export function allChoices(value: boolean): CookieChoices {
  return { analytics: value, thirdParty: value, marketing: value }
}

/** Registro de una decisión. Una categoría que la web no tiene se guarda en false. */
export function buildConsent(org: number, p: CookieProviders, choices: Partial<CookieChoices>, at = new Date()): ConsentRecord {
  const available = new Set(availableCategories(p))
  const c = allChoices(false)
  for (const k of OPTIONAL_COOKIE_CATEGORIES) c[k] = available.has(k) && choices[k] === true
  return { v: consentVersion(p), org, c, at: at.toISOString() }
}

/**
 * Lee lo guardado. Devuelve null —el aviso vuelve a salir— si no hay nada,
 * está corrupto, es de otra web del mismo origen o de otra versión.
 * `org: null` no comprueba la web (la clave de la vista previa es del equipo,
 * no de un visitante de una web concreta).
 */
export function parseConsent(raw: string | null | undefined, org: number | null, p: CookieProviders): ConsentRecord | null {
  if (!raw) return null
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || (org !== null && data.org !== org) || data.v !== consentVersion(p) || !data.c || typeof data.c !== 'object') return null
  const at = typeof data.at === 'string' && !Number.isNaN(Date.parse(data.at)) ? new Date(data.at) : new Date()
  return buildConsent(org ?? (Number(data.org) || 0), p, data.c, at)
}

/** Clave del navegador: la de la web, o una aparte para la vista previa del equipo. */
export function consentStorageKey(preview: boolean): string {
  return preview ? `${COOKIE_CONSENT_STORAGE_KEY}:preview` : COOKIE_CONSENT_STORAGE_KEY
}

/** Categorías que estaban concedidas en `before` y ya no lo están en `after`. */
export function revokedCategories(before: CookieChoices | null, after: CookieChoices): OptionalCookieCategory[] {
  if (!before) return []
  return OPTIONAL_COOKIE_CATEGORIES.filter((k) => before[k] && !after[k])
}

// ---------------------------------------------------------------------------
// IDs de proveedores: validación (servidor y panel) — nunca se inventan.
// ---------------------------------------------------------------------------

export const GA4_ID_RE = /^G-[A-Z0-9]{4,16}$/
export const META_PIXEL_ID_RE = /^\d{5,20}$/

/** «g-abc123 » → «G-ABC123»; vacío → null; inválido → undefined. */
export function normalizeGa4Id(raw: unknown): string | null | undefined {
  if (raw == null) return null
  const v = String(raw).trim().toUpperCase()
  if (!v) return null
  return GA4_ID_RE.test(v) ? v : undefined
}

/** Sólo dígitos (con espacios tolerados); vacío → null; inválido → undefined. */
export function normalizeMetaPixelId(raw: unknown): string | null | undefined {
  if (raw == null) return null
  const v = String(raw).replace(/\s+/g, '')
  if (!v) return null
  return META_PIXEL_ID_RE.test(v) ? v : undefined
}

/** Cookies que deja cada categoría en el navegador y que se borran al retirarla. */
export const CATEGORY_COOKIE_PREFIXES: Record<OptionalCookieCategory, string[]> = {
  analytics: ['sa_ft', '_ga', '_gid', '_gat'],
  thirdParty: [],
  marketing: ['_fbp', '_fbc'],
}

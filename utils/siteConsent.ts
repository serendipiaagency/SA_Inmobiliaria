import { darkenForWhiteText } from './siteFooter'

/**
 * Presentación del aviso de cookies y del aviso de demostración de las webs
 * de las inmobiliarias (components/CookieConsent.vue, components/DemoNotice.vue):
 * textos, identidad visual, posición y comportamiento, configurables por
 * inmobiliaria en el Constructor Web (Configuración global → «Privacidad y
 * cookies» y «Avisos y demostración»).
 *
 * Es SÓLO presentación. La lógica de consentimiento —categorías reales,
 * versión de la política, qué se carga y qué se bloquea, lo que se guarda en
 * el navegador— sigue en utils/cookieConsent.ts y no cambia desde aquí:
 * ningún ajuste de este archivo hace que algo opcional se cargue antes de
 * decidir, oculta Rechazar, premarca una categoría ni quita los enlaces
 * legales. La versión del consentimiento (`consentVersion`) tampoco depende
 * de nada de aquí: cambiar colores o textos no vuelve a preguntar a nadie.
 *
 * Se guarda como un documento más de `site_pages`, con la clave reservada
 * `consent` (igual que el pie, `footer`): borrador, publicación e historial
 * sin ninguna migración. Sin nada publicado, la web enseña el aviso de
 * partida (DEFAULT_CONSENT), que es el de siempre.
 *
 * Como en el pie, nada llega a la web sin pasar por `normalizeSiteConsent`:
 * textos con tope, colores #rrggbb, números acotados, opciones cerradas.
 */

export const CONSENT_PAGE_KEY = 'consent'

/** Los idiomas de la web pública (i18n/messages.ts); los textos propios se guardan por idioma. */
export const CONSENT_LOCALES = ['es', 'en', 'de', 'pt', 'fr', 'ar'] as const
export type ConsentLocale = (typeof CONSENT_LOCALES)[number]
export const CONSENT_LOCALE_LABELS: Record<ConsentLocale, string> = { es: 'Español', en: 'English', de: 'Deutsch', pt: 'Português', fr: 'Français', ar: 'العربية' }

// ---------------------------------------------------------------------------
// Textos del aviso de cookies: cada uno vacío = el de la web en ese idioma
// ---------------------------------------------------------------------------

export type CookieTextKey =
  | 'title'
  | 'intro'
  | 'optionalIntro'
  | 'change'
  | 'settingsTitle'
  | 'settingsIntro'
  | 'necessaryTitle'
  | 'necessaryDesc'
  | 'analyticsTitle'
  | 'analyticsDesc'
  | 'thirdPartyTitle'
  | 'thirdPartyDesc'
  | 'marketingTitle'
  | 'marketingDesc'
  | 'configure'
  | 'reject'
  | 'accept'
  | 'save'
  | 'back'
  | 'policyLabel'
  | 'privacyLabel'

export interface CookieTextDef {
  key: CookieTextKey
  label: string
  /** La clave de i18n/messages.ts de la que sale el texto cuando no se escribe nada. */
  i18nKey: string
  multiline: boolean
  max: number
  group: 'main' | 'settings' | 'categories' | 'buttons' | 'legal'
}

export const COOKIE_TEXTS: CookieTextDef[] = [
  { key: 'title', label: 'Título', i18nKey: 'cookie.title', multiline: false, max: 120, group: 'main' },
  { key: 'intro', label: 'Descripción', i18nKey: 'cookie.intro', multiline: true, max: 600, group: 'main' },
  { key: 'optionalIntro', label: 'Entrada a lo opcional', i18nKey: 'cookie.optionalIntro', multiline: false, max: 160, group: 'main' },
  { key: 'change', label: 'Cómo cambiar la decisión', i18nKey: 'cookie.change', multiline: true, max: 300, group: 'main' },
  { key: 'settingsTitle', label: 'Título de las preferencias', i18nKey: 'cookie.settingsTitle', multiline: false, max: 120, group: 'settings' },
  { key: 'settingsIntro', label: 'Texto de las preferencias', i18nKey: 'cookie.settingsIntro', multiline: true, max: 400, group: 'settings' },
  { key: 'necessaryTitle', label: 'Necesarias · nombre', i18nKey: 'cookie.cat.necessary.title', multiline: false, max: 60, group: 'categories' },
  { key: 'necessaryDesc', label: 'Necesarias · descripción', i18nKey: 'cookie.cat.necessary.desc', multiline: true, max: 400, group: 'categories' },
  { key: 'analyticsTitle', label: 'Analíticas · nombre', i18nKey: 'cookie.cat.analytics.title', multiline: false, max: 60, group: 'categories' },
  { key: 'analyticsDesc', label: 'Analíticas · descripción', i18nKey: 'cookie.cat.analytics.desc', multiline: true, max: 400, group: 'categories' },
  { key: 'thirdPartyTitle', label: 'Contenido de terceros · nombre', i18nKey: 'cookie.cat.thirdParty.title', multiline: false, max: 60, group: 'categories' },
  { key: 'thirdPartyDesc', label: 'Contenido de terceros · descripción', i18nKey: 'cookie.cat.thirdParty.desc', multiline: true, max: 400, group: 'categories' },
  { key: 'marketingTitle', label: 'Publicidad · nombre', i18nKey: 'cookie.cat.marketing.title', multiline: false, max: 60, group: 'categories' },
  { key: 'marketingDesc', label: 'Publicidad · descripción', i18nKey: 'cookie.cat.marketing.desc', multiline: true, max: 400, group: 'categories' },
  { key: 'configure', label: 'Botón «Configurar»', i18nKey: 'cookie.configure', multiline: false, max: 40, group: 'buttons' },
  { key: 'reject', label: 'Botón «Rechazar»', i18nKey: 'cookie.reject', multiline: false, max: 40, group: 'buttons' },
  { key: 'accept', label: 'Botón «Aceptar y continuar»', i18nKey: 'cookie.accept', multiline: false, max: 40, group: 'buttons' },
  { key: 'save', label: 'Botón «Guardar preferencias»', i18nKey: 'cookie.save', multiline: false, max: 40, group: 'buttons' },
  { key: 'back', label: 'Botón «Volver»', i18nKey: 'cookie.back', multiline: false, max: 40, group: 'buttons' },
  { key: 'policyLabel', label: 'Enlace a la política de cookies', i18nKey: 'cookie.policy', multiline: false, max: 60, group: 'legal' },
  { key: 'privacyLabel', label: 'Enlace a la política de privacidad', i18nKey: 'cookie.privacy', multiline: false, max: 60, group: 'legal' },
]
const COOKIE_TEXT_KEYS = COOKIE_TEXTS.map((d) => d.key)

export type CookieTexts = Record<CookieTextKey, string>

export function emptyCookieTexts(): CookieTexts {
  return Object.fromEntries(COOKIE_TEXT_KEYS.map((k) => [k, ''])) as CookieTexts
}

// ---------------------------------------------------------------------------
// El modelo
// ---------------------------------------------------------------------------

export type CookiePosition = 'center' | 'bottom-right' | 'bottom-left' | 'bottom'
export const COOKIE_POSITIONS: { value: CookiePosition; label: string }[] = [
  { value: 'center', label: 'Centrado' },
  { value: 'bottom-right', label: 'Abajo a la derecha' },
  { value: 'bottom-left', label: 'Abajo a la izquierda' },
  { value: 'bottom', label: 'Banner inferior' },
]

export interface CookieNoticeConfig {
  /** Textos propios por idioma; vacío = el de la web en ese idioma. */
  texts: Record<ConsentLocale, CookieTexts>
  design: {
    showLogo: boolean
    /** Logo propio (clave de R2 o URL de la biblioteca); vacío = el del Brand Kit / la empresa. */
    logo: string
    logoSize: 'sm' | 'md' | 'lg'
    /** Colores #rrggbb; vacío = el de partida (o el de la marca, según cuál). */
    background: string
    text: string
    title: string
    /** Botón principal e interruptores; vacío = el color de la marca (oscurecido hasta que el blanco se lea). */
    accent: string
    accentText: string
    border: string
    link: string
    overlay: string
    /** Opacidad del fondo oscurecido en % (0–80). */
    overlayOpacity: number
    /** Radio de las esquinas en px (0–32). */
    radius: number
    shadow: 'none' | 'soft' | 'strong'
    titleFont: 'serif' | 'sans'
    titleSize: 'sm' | 'md' | 'lg'
    titleWeight: 'normal' | 'semibold' | 'bold'
    titleAlign: 'left' | 'center'
    fontSize: 'sm' | 'md' | 'lg'
    spacing: 'compact' | 'normal' | 'airy'
    buttonShape: 'pill' | 'rounded' | 'square'
    /** Un icono discreto junto a cada categoría (candado, gráfico, vídeo, megáfono). */
    categoryIcons: boolean
  }
  layout: {
    position: CookiePosition
    /** Anchura máxima en px (360–960); el banner inferior ocupa todo el ancho. */
    maxWidth: number
    /** Separación de los bordes de la pantalla en px (0–48). */
    edgeOffset: number
    /** Altura máxima en % del alto visible (50–95); por encima, la parte central se desplaza. */
    maxHeight: number
    /** En el móvil: hoja anclada abajo o a pantalla completa. */
    mobile: 'sheet' | 'full'
  }
  behavior: {
    animation: 'fade' | 'slide' | 'none'
    /** En el resumen, cada categoría con su descripción (si no, sólo los nombres). */
    showCategoryDescriptions: boolean
    /** «Puedes cambiar o retirar tu consentimiento…». */
    showChangeText: boolean
    /** «Responsable: <razón social>». */
    showController: boolean
  }
}

export type DemoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export const DEMO_POSITIONS: { value: DemoPosition; label: string }[] = [
  { value: 'top-left', label: 'Arriba a la izquierda' },
  { value: 'top-right', label: 'Arriba a la derecha' },
  { value: 'bottom-left', label: 'Abajo a la izquierda' },
  { value: 'bottom-right', label: 'Abajo a la derecha' },
]
export type DemoIcon = 'info' | 'flask' | 'eye' | 'none'
export const DEMO_ICONS: { value: DemoIcon; label: string }[] = [
  { value: 'info', label: 'Información' },
  { value: 'flask', label: 'Laboratorio' },
  { value: 'eye', label: 'Vista' },
  { value: 'none', label: 'Sin icono' },
]

export interface DemoNoticeConfig {
  /** Sólo se enseña en la web de una cuenta de demostración (el servidor lo decide, no este ajuste). */
  enabled: boolean
  /** Título y texto por idioma; vacío = los de la web en ese idioma. */
  texts: Record<ConsentLocale, { title: string; text: string }>
  icon: DemoIcon
  design: {
    /** Vacío = verde petróleo oscuro. */
    background: string
    /** Vacío = blanco. */
    text: string
    /** Vacío = el color del texto. */
    icon: string
    radius: number
    shadow: 'none' | 'soft' | 'strong'
    size: 'sm' | 'md'
    /** Anchura máxima en px (240–480). */
    maxWidth: number
  }
  position: DemoPosition
  /** Separación de los bordes en px (8–48). La parte de arriba suma además la cabecera: nunca la tapa. */
  offset: number
  animation: 'fade' | 'slide' | 'none'
  closable: boolean
  /** Qué dura el cierre: la visita (sessionStorage), siempre (localStorage) o nada (vuelve en cada página). */
  rememberClose: 'session' | 'always' | 'never'
}

export interface SiteConsentConfig {
  cookie: CookieNoticeConfig
  demo: DemoNoticeConfig
}

function emptyTextsByLocale(): Record<ConsentLocale, CookieTexts> {
  return Object.fromEntries(CONSENT_LOCALES.map((l) => [l, emptyCookieTexts()])) as Record<ConsentLocale, CookieTexts>
}
function emptyDemoTexts(): Record<ConsentLocale, { title: string; text: string }> {
  return Object.fromEntries(CONSENT_LOCALES.map((l) => [l, { title: '', text: '' }])) as Record<ConsentLocale, { title: string; text: string }>
}

/** El aviso de cookies de partida: el de siempre (blanco cálido, centrado, botones píldora). */
export function defaultCookieNotice(): CookieNoticeConfig {
  return {
    texts: emptyTextsByLocale(),
    design: {
      showLogo: true,
      logo: '',
      logoSize: 'md',
      background: '',
      text: '',
      title: '',
      accent: '',
      accentText: '',
      border: '',
      link: '',
      overlay: '',
      overlayOpacity: 45,
      radius: 24,
      shadow: 'soft',
      titleFont: 'serif',
      titleSize: 'md',
      titleWeight: 'bold',
      titleAlign: 'left',
      fontSize: 'md',
      spacing: 'normal',
      buttonShape: 'pill',
      categoryIcons: true,
    },
    layout: { position: 'center', maxWidth: 680, edgeOffset: 24, maxHeight: 92, mobile: 'sheet' },
    behavior: { animation: 'fade', showCategoryDescriptions: true, showChangeText: true, showController: true },
  }
}

/** El aviso de demostración de partida: compacto, verde petróleo, arriba a la izquierda, se puede cerrar durante la visita. */
export function defaultDemoNotice(): DemoNoticeConfig {
  return {
    enabled: true,
    texts: emptyDemoTexts(),
    icon: 'info',
    design: { background: '', text: '', icon: '', radius: 16, shadow: 'soft', size: 'md', maxWidth: 360 },
    position: 'top-left',
    offset: 16,
    animation: 'fade',
    closable: true,
    rememberClose: 'session',
  }
}

export function defaultSiteConsent(): SiteConsentConfig {
  return { cookie: defaultCookieNotice(), demo: defaultDemoNotice() }
}

// ---------------------------------------------------------------------------
// Normalización: lo único que llega a la web
// ---------------------------------------------------------------------------

export const CONSENT_LIMITS = {
  demoTitle: 80,
  demoText: 300,
  url: 500,
  overlayOpacity: [0, 80] as const,
  radius: [0, 32] as const,
  maxWidth: [360, 960] as const,
  edgeOffset: [0, 48] as const,
  maxHeight: [50, 95] as const,
  demoOffset: [8, 48] as const,
  demoMaxWidth: [240, 480] as const,
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '')
const multi = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[^\P{Cc}\n]/gu, ' ').trim().slice(0, max) : '')
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : '')
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)
const clampInt = (v: unknown, range: readonly [number, number], fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(range[1], Math.max(range[0], Math.round(n))) : fallback
}
const media = (v: unknown) => {
  const s = str(v, CONSENT_LIMITS.url)
  return /^(javascript|data|vbscript):/i.test(s) ? '' : s
}

function normalizeCookieTexts(raw: unknown): Record<ConsentLocale, CookieTexts> {
  const out = emptyTextsByLocale()
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
  for (const locale of CONSENT_LOCALES) {
    const src = r[locale]
    if (!src || typeof src !== 'object') continue
    for (const def of COOKIE_TEXTS) out[locale][def.key] = def.multiline ? multi(src[def.key], def.max) : str(src[def.key], def.max)
  }
  return out
}

export function normalizeCookieNotice(raw: unknown): CookieNoticeConfig {
  const d = defaultCookieNotice()
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
  const g = r.design || {}
  const l = r.layout || {}
  const b = r.behavior || {}
  return {
    texts: normalizeCookieTexts(r.texts),
    design: {
      showLogo: bool(g.showLogo, d.design.showLogo),
      logo: media(g.logo),
      logoSize: oneOf(g.logoSize, ['sm', 'md', 'lg'] as const, d.design.logoSize),
      background: hex(g.background),
      text: hex(g.text),
      title: hex(g.title),
      accent: hex(g.accent),
      accentText: hex(g.accentText),
      border: hex(g.border),
      link: hex(g.link),
      overlay: hex(g.overlay),
      overlayOpacity: clampInt(g.overlayOpacity, CONSENT_LIMITS.overlayOpacity, d.design.overlayOpacity),
      radius: clampInt(g.radius, CONSENT_LIMITS.radius, d.design.radius),
      shadow: oneOf(g.shadow, ['none', 'soft', 'strong'] as const, d.design.shadow),
      titleFont: oneOf(g.titleFont, ['serif', 'sans'] as const, d.design.titleFont),
      titleSize: oneOf(g.titleSize, ['sm', 'md', 'lg'] as const, d.design.titleSize),
      titleWeight: oneOf(g.titleWeight, ['normal', 'semibold', 'bold'] as const, d.design.titleWeight),
      titleAlign: oneOf(g.titleAlign, ['left', 'center'] as const, d.design.titleAlign),
      fontSize: oneOf(g.fontSize, ['sm', 'md', 'lg'] as const, d.design.fontSize),
      spacing: oneOf(g.spacing, ['compact', 'normal', 'airy'] as const, d.design.spacing),
      buttonShape: oneOf(g.buttonShape, ['pill', 'rounded', 'square'] as const, d.design.buttonShape),
      categoryIcons: bool(g.categoryIcons, d.design.categoryIcons),
    },
    layout: {
      position: oneOf(
        l.position,
        COOKIE_POSITIONS.map((p) => p.value),
        d.layout.position,
      ),
      maxWidth: clampInt(l.maxWidth, CONSENT_LIMITS.maxWidth, d.layout.maxWidth),
      edgeOffset: clampInt(l.edgeOffset, CONSENT_LIMITS.edgeOffset, d.layout.edgeOffset),
      maxHeight: clampInt(l.maxHeight, CONSENT_LIMITS.maxHeight, d.layout.maxHeight),
      mobile: oneOf(l.mobile, ['sheet', 'full'] as const, d.layout.mobile),
    },
    behavior: {
      animation: oneOf(b.animation, ['fade', 'slide', 'none'] as const, d.behavior.animation),
      showCategoryDescriptions: bool(b.showCategoryDescriptions, d.behavior.showCategoryDescriptions),
      showChangeText: bool(b.showChangeText, d.behavior.showChangeText),
      showController: bool(b.showController, d.behavior.showController),
    },
  }
}

export function normalizeDemoNotice(raw: unknown): DemoNoticeConfig {
  const d = defaultDemoNotice()
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
  const g = r.design || {}
  const texts = emptyDemoTexts()
  const srcTexts = r.texts && typeof r.texts === 'object' ? r.texts : {}
  for (const locale of CONSENT_LOCALES) {
    const src = srcTexts[locale]
    if (!src || typeof src !== 'object') continue
    texts[locale] = { title: str(src.title, CONSENT_LIMITS.demoTitle), text: multi(src.text, CONSENT_LIMITS.demoText) }
  }
  return {
    enabled: bool(r.enabled, d.enabled),
    texts,
    icon: oneOf(
      r.icon,
      DEMO_ICONS.map((i) => i.value),
      d.icon,
    ),
    design: {
      background: hex(g.background),
      text: hex(g.text),
      icon: hex(g.icon),
      radius: clampInt(g.radius, CONSENT_LIMITS.radius, d.design.radius),
      shadow: oneOf(g.shadow, ['none', 'soft', 'strong'] as const, d.design.shadow),
      size: oneOf(g.size, ['sm', 'md'] as const, d.design.size),
      maxWidth: clampInt(g.maxWidth, CONSENT_LIMITS.demoMaxWidth, d.design.maxWidth),
    },
    position: oneOf(
      r.position,
      DEMO_POSITIONS.map((p) => p.value),
      d.position,
    ),
    offset: clampInt(r.offset, CONSENT_LIMITS.demoOffset, d.offset),
    animation: oneOf(r.animation, ['fade', 'slide', 'none'] as const, d.animation),
    closable: bool(r.closable, d.closable),
    rememberClose: oneOf(r.rememberClose, ['session', 'always', 'never'] as const, d.rememberClose),
  }
}

/** Cualquier cosa → una configuración completa y segura (lo que falte, de partida). */
export function normalizeSiteConsent(raw: unknown): SiteConsentConfig {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
  return { cookie: normalizeCookieNotice(r.cookie), demo: normalizeDemoNotice(r.demo) }
}

// ---------------------------------------------------------------------------
// Resolución: lo que se pinta
// ---------------------------------------------------------------------------

type Translate = (key: string) => string

/** El texto de la web en el idioma del visitante o, si la agencia escribió el suyo en ese idioma, el suyo. */
export function cookieText(config: CookieNoticeConfig, locale: string, key: CookieTextKey, t: Translate): string {
  const loc = (CONSENT_LOCALES as readonly string[]).includes(locale) ? (locale as ConsentLocale) : 'es'
  const own = config.texts[loc]?.[key]
  if (own) return own
  const def = COOKIE_TEXTS.find((d) => d.key === key)!
  return t(def.i18nKey)
}

export function demoText(config: DemoNoticeConfig, locale: string, key: 'title' | 'text', t: Translate): string {
  const loc = (CONSENT_LOCALES as readonly string[]).includes(locale) ? (locale as ConsentLocale) : 'es'
  return config.texts[loc]?.[key] || t(key === 'title' ? 'demo.notice.title' : 'demo.notice.text')
}

/** Los colores de partida del aviso de cookies: blanco cálido, la tinta de la web y gris cálido para el texto. */
export const COOKIE_DEFAULT_COLORS = {
  background: '#fffdf9',
  text: '#57534e',
  title: '#1c1b17',
  ink: '#1c1b17',
  accentText: '#ffffff',
  border: '#e7e4de',
  overlay: '#1c1b17',
}

export interface CookiePalette {
  background: string
  text: string
  title: string
  accent: string
  accentText: string
  border: string
  link: string
  overlay: string
}

/**
 * La paleta del aviso: lo elegido o, sin elegir, la de partida con el color
 * de la marca en el botón principal y los interruptores (oscurecido hasta que
 * el texto blanco se lea). Sin color de marca, la tinta de la web.
 */
export function cookiePalette(design: CookieNoticeConfig['design'], brandColor: string | null | undefined): CookiePalette {
  const brand = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : COOKIE_DEFAULT_COLORS.ink
  const title = design.title || COOKIE_DEFAULT_COLORS.title
  return {
    background: design.background || COOKIE_DEFAULT_COLORS.background,
    text: design.text || COOKIE_DEFAULT_COLORS.text,
    title,
    accent: darkenForWhiteText(design.accent || brand),
    accentText: design.accentText || COOKIE_DEFAULT_COLORS.accentText,
    border: design.border || COOKIE_DEFAULT_COLORS.border,
    link: design.link || title,
    overlay: design.overlay || COOKIE_DEFAULT_COLORS.overlay,
  }
}

/** Los colores de partida del aviso de demostración: verde petróleo oscuro con texto blanco. */
export const DEMO_DEFAULT_COLORS = { background: '#0f3d3a', text: '#ffffff' }

export function demoPalette(design: DemoNoticeConfig['design']): { background: string; text: string; icon: string } {
  const text = design.text || DEMO_DEFAULT_COLORS.text
  return { background: design.background || DEMO_DEFAULT_COLORS.background, text, icon: design.icon || text }
}

/** Clave del navegador para recordar que se cerró el aviso de demostración de ESTA web. */
export function demoNoticeStorageKey(orgId: number): string {
  return `inmo_demo_notice_closed:${orgId}`
}

export const SHADOWS: Record<'none' | 'soft' | 'strong', string> = {
  none: 'none',
  soft: '0 24px 60px -18px rgba(28, 27, 25, 0.35)',
  strong: '0 32px 80px -16px rgba(28, 27, 25, 0.55)',
}

/** Lo que la web (y el lienzo) saben de la empresa para pintar el aviso sin inventar nada. */
export interface ConsentProfile {
  /** El logo del Brand Kit o, si no, el de la empresa; null = sin logo (el aviso no lo enseña). */
  logo: string | null
  brandColor: string | null
  companyName: string
  /** Qué datos legales faltan en la ficha de la empresa: el panel avisa, la web pone «por confirmar». */
  legalMissing: ('legalCompanyName' | 'taxId' | 'legalAddress' | 'legalEmail')[]
  /** La web es la de una cuenta de demostración (y por tanto enseña el aviso de demostración). */
  isDemo: boolean
}

export const LEGAL_FIELD_LABELS: Record<ConsentProfile['legalMissing'][number], string> = {
  legalCompanyName: 'razón social',
  taxId: 'CIF/NIF',
  legalAddress: 'dirección',
  legalEmail: 'email de contacto',
}

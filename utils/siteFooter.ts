import { relativeLuminance } from './contactTone'

/**
 * El pie global de las webs de las inmobiliarias (components/site/
 * SiteFooter.vue): un solo pie para todas las páginas, editable en el
 * Constructor Web al pulsarlo en el lienzo.
 *
 * Se guarda como un documento más de `site_pages`, con la clave reservada
 * `footer` (no es una página: no está en SITE_PAGES ni tiene dirección), y
 * así tiene borrador, publicación e historial de versiones igual que las
 * páginas. Mientras no se publique nada, la web enseña el pie de partida
 * (DEFAULT_FOOTER), que es el de siempre ordenado en cinco columnas.
 *
 * Este archivo es el modelo compartido (servidor, web y editor): qué se
 * puede configurar, sus valores de partida y la normalización que se aplica
 * al guardar y al pintar. Nada de lo que llegue sin pasar por aquí llega a la
 * web: textos con tope de longitud, colores #rrggbb, enlaces externos sólo
 * http(s)/mailto/tel y redes sólo hacia su propio dominio.
 */

export const FOOTER_PAGE_KEY = 'footer'

// ---------------------------------------------------------------------------
// Destinos internos: identificadores estables, nunca rutas escritas a mano
// ---------------------------------------------------------------------------

export type FooterTargetGroup = 'explore' | 'company' | 'services' | 'legal'

export interface FooterTarget {
  /** Identificador estable: es lo que se guarda, no la dirección. */
  id: string
  label: string
  i18nKey: string
  path: string
  group: FooterTargetGroup
  /** Sólo existe en la web si esa página del Constructor está publicada (Servicios). */
  requiresPublished?: string
}

/** Las páginas reales de la web a las que el pie puede enlazar. */
export const FOOTER_TARGETS: FooterTarget[] = [
  { id: 'buy', label: 'Comprar', i18nKey: 'footer.link.buy', path: '/propiedades?operacion=venta', group: 'explore' },
  { id: 'rent', label: 'Alquilar', i18nKey: 'footer.link.rent', path: '/propiedades?operacion=alquiler', group: 'explore' },
  { id: 'properties', label: 'Todas las propiedades', i18nKey: 'footer.link.properties', path: '/propiedades', group: 'explore' },
  { id: 'map', label: 'Mapa de propiedades', i18nKey: 'footer.link.map', path: '/mapa', group: 'explore' },
  { id: 'new-build', label: 'Obra nueva', i18nKey: 'footer.link.newBuild', path: '/propiedades?operacion=venta&estado=obra_nueva', group: 'explore' },
  { id: 'communities', label: 'Comunidades', i18nKey: 'footer.communities', path: '/zonas', group: 'explore' },
  { id: 'developers', label: 'Promotores', i18nKey: 'footer.developers', path: '/promotoras', group: 'explore' },
  { id: 'about', label: 'Sobre nosotros', i18nKey: 'footer.about', path: '/nosotros', group: 'company' },
  { id: 'team', label: 'Nuestro equipo', i18nKey: 'footer.team', path: '/equipo', group: 'company' },
  { id: 'blog', label: 'Blog', i18nKey: 'nav.blog', path: '/blog', group: 'company' },
  { id: 'services', label: 'Servicios', i18nKey: 'footer.services', path: '/servicios', group: 'company', requiresPublished: 'servicios' },
  { id: 'contact', label: 'Contacto', i18nKey: 'nav.contact', path: '/contacto', group: 'company' },
  { id: 'visit', label: 'Solicitar visita', i18nKey: 'footer.link.visit', path: '/visitante', group: 'services' },
  { id: 'sell', label: 'Vender propiedad', i18nKey: 'footer.link.sell', path: '/vender', group: 'services' },
  { id: 'client-area', label: 'Área de clientes', i18nKey: 'footer.link.clientArea', path: '/mi-cuenta', group: 'services' },
  { id: 'favorites', label: 'Favoritos', i18nKey: 'nav.favorites', path: '/favoritos', group: 'services' },
  { id: 'vendor', label: 'Registro de proveedor', i18nKey: 'footer.vendor', path: '/proveedores/registro', group: 'services' },
  { id: 'complaints', label: 'Reclamaciones', i18nKey: 'footer.complaints', path: '/reclamaciones', group: 'services' },
  { id: 'privacy', label: 'Política de privacidad', i18nKey: 'footer.privacy', path: '/privacidad', group: 'legal' },
  { id: 'terms', label: 'Términos y condiciones', i18nKey: 'footer.terms', path: '/terminos', group: 'legal' },
  { id: 'cookies', label: 'Política de cookies', i18nKey: 'cookie.policy', path: '/cookies', group: 'legal' },
]

export function footerTarget(id: string | null | undefined): FooterTarget | null {
  return FOOTER_TARGETS.find((t) => t.id === id) || null
}

/** Lo que el servidor sabe de la web que el pie no puede saber solo. */
export interface FooterAvailability {
  /** Páginas del Constructor con versión publicada (para las que sólo existen publicadas). */
  publishedPages: string[]
}

// ---------------------------------------------------------------------------
// Redes sociales: sólo las configuradas, y sólo hacia su propio dominio
// ---------------------------------------------------------------------------

export type FooterSocialNetwork = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x' | 'tiktok' | 'pinterest'

export const FOOTER_SOCIAL_NETWORKS: { key: FooterSocialNetwork; label: string; hosts: string[] }[] = [
  { key: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { key: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  { key: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'] },
  { key: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { key: 'x', label: 'X (Twitter)', hosts: ['x.com', 'twitter.com'] },
  { key: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { key: 'pinterest', label: 'Pinterest', hosts: ['pinterest.com', 'pinterest.es'] },
]
const SOCIAL_KEYS = FOOTER_SOCIAL_NETWORKS.map((n) => n.key) as string[]

export interface FooterSocialLink {
  network: FooterSocialNetwork
  url: string
}

/** La URL, si es https y del dominio de esa red (o un subdominio suyo); si no, null. */
export function validSocialUrl(network: string, url: string): string | null {
  const def = FOOTER_SOCIAL_NETWORKS.find((n) => n.key === network)
  if (!def) return null
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  return def.hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? u.toString() : null
}

/**
 * Las redes del Brand Kit (`social_links_json`, `{ instagram: url, … }`):
 * las que tienen una URL real de su red; el resto (vacías, de otro dominio,
 * de ejemplo) no se enseñan.
 */
export function socialLinksFromBrandKit(json: string | null | undefined): FooterSocialLink[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json || '{}')
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const out: FooterSocialLink[] = []
  for (const net of FOOTER_SOCIAL_NETWORKS) {
    const raw = (parsed as Record<string, unknown>)[net.key] ?? (net.key === 'x' ? (parsed as Record<string, unknown>).twitter : undefined)
    const url = typeof raw === 'string' ? validSocialUrl(net.key, raw) : null
    if (url) out.push({ network: net.key, url })
  }
  return out
}

// ---------------------------------------------------------------------------
// El modelo
// ---------------------------------------------------------------------------

export type FooterSectionKey = 'identity' | 'explore' | 'company' | 'services' | 'newsletter'
export const FOOTER_SECTIONS: { key: FooterSectionKey; label: string }[] = [
  { key: 'identity', label: 'Identidad (logo, descripción y redes)' },
  { key: 'explore', label: 'Explorar' },
  { key: 'company', label: 'Empresa' },
  { key: 'services', label: 'Servicios' },
  { key: 'newsletter', label: 'Suscríbete y contacto' },
]
const SECTION_KEYS = FOOTER_SECTIONS.map((s) => s.key) as string[]

export type FooterLinkColumnKey = 'explore' | 'company' | 'services'
export const FOOTER_LINK_COLUMNS: { key: FooterLinkColumnKey; label: string; i18nKey: string }[] = [
  { key: 'explore', label: 'Explorar', i18nKey: 'footer.explore' },
  { key: 'company', label: 'Empresa', i18nKey: 'footer.company' },
  { key: 'services', label: 'Servicios', i18nKey: 'footer.services' },
]

/** Lo que se puede ocultar sólo en el móvil. */
export type FooterMobileHideable = FooterSectionKey | 'social' | 'contact' | 'landscape'
const MOBILE_HIDEABLE = [...SECTION_KEYS, 'social', 'contact', 'landscape']

export interface FooterLink {
  /** Estable dentro del pie (reordenar, editar). */
  id: string
  /** `page`: una página de la web (FOOTER_TARGETS); `url`: un enlace externo. */
  kind: 'page' | 'url'
  /** El id del destino (`page`) o la dirección (`url`). */
  target: string
  /** Vacío = el nombre de la página en el idioma de la web. */
  label: string
  visible: boolean
}

export interface FooterLinkColumn {
  /** Vacío = «Explorar», «Empresa» o «Servicios» en el idioma de la web. */
  title: string
  links: FooterLink[]
}

export type FooterLandscapeMode = 'none' | 'preset' | 'image'
export type FooterLandscapePreset = 'coast' | 'mountains' | 'city' | 'countryside'
export const FOOTER_LANDSCAPE_PRESETS: { key: FooterLandscapePreset; label: string }[] = [
  { key: 'coast', label: 'Montaña y costa con faro' },
  { key: 'mountains', label: 'Montañas' },
  { key: 'city', label: 'Ciudad' },
  { key: 'countryside', label: 'Campo' },
]

export interface FooterConfig {
  /** El orden de las cinco columnas en escritorio (y de los bloques en el móvil). */
  order: FooterSectionKey[]
  show: Record<FooterSectionKey, boolean> & { social: boolean; contact: boolean }
  /** Bloques que no se enseñan en el móvil (siguen en escritorio y tableta). */
  hideOnMobile: FooterMobileHideable[]
  /** En el móvil, Explorar/Empresa/Servicios se pliegan bajo su título. */
  mobileAccordions: boolean
  /** Vacío = la frase de presentación de siempre. */
  description: string
  /** null = las redes del Brand Kit; una lista (aunque vacía) = las elegidas aquí. */
  social: FooterSocialLink[] | null
  columns: Record<FooterLinkColumnKey, FooterLinkColumn>
  newsletter: { title: string; text: string }
  /** Vacíos = los datos de la empresa (Brand Kit, datos legales, oficina principal). */
  contact: { phone: string; hours: string; location: string; showMap: boolean }
  landscape: {
    mode: FooterLandscapeMode
    preset: FooterLandscapePreset
    /** Imagen propia (clave de R2 o URL de la biblioteca de medios). */
    image: string
    /** Opacidad en % (5–60). */
    opacity: number
    /** Altura en px (80–320). */
    height: number
    position: 'bottom' | 'center' | 'top'
  }
  bottom: {
    /** Vacío = el nombre de la empresa. */
    copyright: string
    showPrivacy: boolean
    showTerms: boolean
    showCookies: boolean
    /** Siempre true: «Configurar cookies» no se puede ocultar (el consentimiento se tiene que poder retirar). */
    showCookieSettings: boolean
    showLanguage: boolean
    showBackToTop: boolean
  }
  design: {
    /** Colores #rrggbb; vacío = el de partida (o el de la marca, según cuál). */
    background: string
    text: string
    headingBackground: string
    headingText: string
    headingStyle: 'pill' | 'plain'
    /** Iconos sociales al pasar el ratón y botón del newsletter; vacío = color de marca. */
    accent: string
    bottomBackground: string
    bottomText: string
    fontSize: 'sm' | 'md' | 'lg'
    spacing: 'compact' | 'normal' | 'airy'
    columnGap: 'sm' | 'md' | 'lg'
    socialStyle: 'soft' | 'outline' | 'solid'
  }
}

let idSeq = 0
/** Un id nuevo para un enlace (en el editor). */
export function newFooterLinkId(): string {
  idSeq = (idSeq + 1) % 1000
  return `l-${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

const pageLink = (target: string): FooterLink => ({ id: `d-${target}`, kind: 'page', target, label: '', visible: true })

/**
 * El pie de partida: el de siempre, con sus enlaces a páginas que existen.
 * «Proyectos off-plan» pasa a ser Comprar/Alquilar; «Promotores» deja de
 * estar de partida (sigue disponible para añadirlo) y «Servicios» sólo se ve
 * si esa página está publicada.
 */
export function defaultFooterConfig(): FooterConfig {
  return {
    order: ['identity', 'explore', 'company', 'services', 'newsletter'],
    show: { identity: true, explore: true, company: true, services: true, newsletter: true, social: true, contact: true },
    hideOnMobile: [],
    mobileAccordions: true,
    description: '',
    social: null,
    columns: {
      explore: { title: '', links: ['buy', 'rent', 'map', 'new-build', 'communities'].map(pageLink) },
      company: { title: '', links: ['about', 'team', 'blog', 'services'].map(pageLink) },
      services: { title: '', links: ['visit', 'sell', 'client-area', 'vendor', 'complaints', 'contact'].map(pageLink) },
    },
    newsletter: { title: '', text: '' },
    contact: { phone: '', hours: '', location: '', showMap: true },
    landscape: { mode: 'none', preset: 'coast', image: '', opacity: 22, height: 160, position: 'bottom' },
    bottom: { copyright: '', showPrivacy: true, showTerms: true, showCookies: true, showCookieSettings: true, showLanguage: true, showBackToTop: true },
    design: {
      background: '',
      text: '',
      headingBackground: '',
      headingText: '',
      headingStyle: 'pill',
      accent: '',
      bottomBackground: '',
      bottomText: '',
      fontSize: 'md',
      spacing: 'normal',
      columnGap: 'md',
      socialStyle: 'soft',
    },
  }
}

// ---------------------------------------------------------------------------
// Normalización: lo único que llega a la web
// ---------------------------------------------------------------------------

export const FOOTER_LIMITS = { links: 12, social: 8, description: 400, title: 40, label: 60, text: 240, hours: 80, phone: 40, location: 120, copyright: 120, url: 500 }

// Sin caracteres de control (saltos de línea incluidos, salvo en los textos multilínea que los admiten como espacio).
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '')
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : '')
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const LINK_ID = /^[A-Za-z0-9_-]{1,40}$/

function normalizeLinks(value: unknown, fallback: FooterLink[]): FooterLink[] {
  if (!Array.isArray(value)) return fallback
  const out: FooterLink[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || out.length >= FOOTER_LIMITS.links) continue
    const kind = item.kind === 'url' ? 'url' : 'page'
    // Un destino que ya no existe se conserva (el editor lo marca y la web
    // no lo enseña): no se borra en silencio de lo guardado.
    const target = kind === 'page' ? str(item.target, 40).replace(/[^a-z0-9-]/g, '') : str(item.target, FOOTER_LIMITS.url)
    if (!target) continue
    let id = typeof item.id === 'string' && LINK_ID.test(item.id) ? item.id : `l-${out.length}`
    while (seen.has(id)) id = `${id}-${out.length}`
    seen.add(id)
    out.push({ id, kind, target, label: str(item.label, FOOTER_LIMITS.label), visible: item.visible !== false })
  }
  return out
}

function normalizeSocial(value: unknown): FooterSocialLink[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return null
  const out: FooterSocialLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || out.length >= FOOTER_LIMITS.social) continue
    if (!SOCIAL_KEYS.includes(item.network)) continue
    // Se guarda lo escrito (aunque aún no sea válido: el editor lo señala);
    // la web sólo enseña las que pasan validSocialUrl.
    out.push({ network: item.network, url: str(item.url, FOOTER_LIMITS.url) })
  }
  return out
}

/** Cualquier cosa → un FooterConfig completo y seguro (lo que falte, de partida). */
export function normalizeFooterConfig(raw: unknown): FooterConfig {
  const d = defaultFooterConfig()
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}

  const order: FooterSectionKey[] = []
  for (const k of Array.isArray(r.order) ? r.order : []) if (SECTION_KEYS.includes(k) && !order.includes(k)) order.push(k)
  for (const k of d.order) if (!order.includes(k)) order.push(k)

  const show = { ...d.show }
  for (const k of Object.keys(show) as (keyof typeof show)[]) show[k] = bool(r.show?.[k], d.show[k])

  const columns = {} as FooterConfig['columns']
  for (const { key } of FOOTER_LINK_COLUMNS) {
    columns[key] = { title: str(r.columns?.[key]?.title, FOOTER_LIMITS.title), links: normalizeLinks(r.columns?.[key]?.links, d.columns[key].links) }
  }

  const l = r.landscape || {}
  const b = r.bottom || {}
  const g = r.design || {}
  return {
    order,
    show,
    hideOnMobile: (Array.isArray(r.hideOnMobile) ? (r.hideOnMobile as unknown[]) : []).filter((k, i, a): k is FooterMobileHideable => MOBILE_HIDEABLE.includes(k as string) && a.indexOf(k) === i),
    mobileAccordions: bool(r.mobileAccordions, d.mobileAccordions),
    description: str(r.description, FOOTER_LIMITS.description),
    social: normalizeSocial(r.social),
    columns,
    newsletter: { title: str(r.newsletter?.title, FOOTER_LIMITS.title), text: str(r.newsletter?.text, FOOTER_LIMITS.text) },
    contact: {
      phone: str(r.contact?.phone, FOOTER_LIMITS.phone),
      hours: str(r.contact?.hours, FOOTER_LIMITS.hours),
      location: str(r.contact?.location, FOOTER_LIMITS.location),
      showMap: bool(r.contact?.showMap, d.contact.showMap),
    },
    landscape: {
      mode: oneOf(l.mode, ['none', 'preset', 'image'] as const, d.landscape.mode),
      preset: oneOf(l.preset, FOOTER_LANDSCAPE_PRESETS.map((p) => p.key), d.landscape.preset),
      image: /^(javascript|data|vbscript):/i.test(str(l.image, FOOTER_LIMITS.url)) ? '' : str(l.image, FOOTER_LIMITS.url),
      opacity: clampInt(l.opacity, 5, 60, d.landscape.opacity),
      height: clampInt(l.height, 80, 320, d.landscape.height),
      position: oneOf(l.position, ['bottom', 'center', 'top'] as const, d.landscape.position),
    },
    bottom: {
      copyright: str(b.copyright, FOOTER_LIMITS.copyright),
      showPrivacy: bool(b.showPrivacy, true),
      showTerms: bool(b.showTerms, true),
      showCookies: bool(b.showCookies, true),
      // Siempre: el consentimiento tiene que poder cambiarse o retirarse desde cualquier página.
      showCookieSettings: true,
      showLanguage: bool(b.showLanguage, true),
      showBackToTop: bool(b.showBackToTop, true),
    },
    design: {
      background: hex(g.background),
      text: hex(g.text),
      headingBackground: hex(g.headingBackground),
      headingText: hex(g.headingText),
      headingStyle: oneOf(g.headingStyle, ['pill', 'plain'] as const, 'pill'),
      accent: hex(g.accent),
      bottomBackground: hex(g.bottomBackground),
      bottomText: hex(g.bottomText),
      fontSize: oneOf(g.fontSize, ['sm', 'md', 'lg'] as const, 'md'),
      spacing: oneOf(g.spacing, ['compact', 'normal', 'airy'] as const, 'normal'),
      columnGap: oneOf(g.columnGap, ['sm', 'md', 'lg'] as const, 'md'),
      socialStyle: oneOf(g.socialStyle, ['soft', 'outline', 'solid'] as const, 'soft'),
    },
  }
}

// ---------------------------------------------------------------------------
// Enlaces: a dónde llevan (o por qué no se enseñan)
// ---------------------------------------------------------------------------

/** Un enlace externo seguro: http(s) con dominio, mailto: o tel:. Si no, null. */
export function safeExternalUrl(url: string): string | null {
  const v = url.trim()
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) return v
  if (/^tel:\+?[0-9 ()-]{6,20}$/i.test(v)) return v.replace(/\s+/g, '')
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!u.hostname.includes('.') || u.username || u.password) return null
  return u.toString()
}

export type FooterLinkProblem = 'unknown-page' | 'unpublished-page' | 'invalid-url' | null

/** Por qué un enlace no se enseña en la web (null = se enseña). */
export function footerLinkProblem(link: FooterLink, available: FooterAvailability | null | undefined): FooterLinkProblem {
  if (link.kind === 'url') return safeExternalUrl(link.target) ? null : 'invalid-url'
  const target = footerTarget(link.target)
  if (!target) return 'unknown-page'
  if (target.requiresPublished && !(available?.publishedPages || []).includes(target.requiresPublished)) return 'unpublished-page'
  return null
}

export const FOOTER_LINK_PROBLEMS: Record<Exclude<FooterLinkProblem, null>, string> = {
  'unknown-page': 'Esta página ya no existe en la web: el enlace no se enseña. Elige otro destino o quítalo.',
  'unpublished-page': 'La página aún no está publicada: el enlace aparecerá cuando la publiques.',
  'invalid-url': 'La dirección no es válida (usa https://…, mailto: o tel:): el enlace no se enseña.',
}

export interface ResolvedFooterLink {
  id: string
  label: string
  /** Página de la web (NuxtLink) o enlace externo (nueva pestaña, noopener). */
  to: string
  external: boolean
}

type Translate = (key: string, fallback: string) => string

/** Los enlaces visibles de una columna, listos para pintar (los que no tienen destino, fuera). */
export function resolveFooterLinks(column: FooterLinkColumn, available: FooterAvailability | null | undefined, t: Translate): ResolvedFooterLink[] {
  const out: ResolvedFooterLink[] = []
  for (const link of column.links) {
    if (!link.visible || footerLinkProblem(link, available)) continue
    if (link.kind === 'url') {
      const to = safeExternalUrl(link.target)!
      const fallback = to.replace(/^(https?:\/\/|mailto:|tel:)/, '').replace(/\/$/, '')
      out.push({ id: link.id, label: link.label || fallback, to, external: /^https?:/.test(to) })
    } else {
      const target = footerTarget(link.target)!
      out.push({ id: link.id, label: link.label || t(target.i18nKey, target.label), to: target.path, external: false })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Contacto: lo configurado o, si no, lo de la empresa; nada inventado
// ---------------------------------------------------------------------------

/** Lo que el servidor sabe de la empresa (Brand Kit, datos legales, oficina principal). */
export interface FooterProfile {
  phone: string | null
  /** «Ciudad, Provincia» de la oficina principal. */
  location: string | null
  /** Dirección completa para «Ver en el mapa». */
  mapQuery: string | null
  social: FooterSocialLink[]
}

export interface ResolvedFooterContact {
  phone: { label: string; href: string } | null
  hours: string
  location: { label: string; mapUrl: string | null } | null
}

/** Teléfono → `tel:` (sólo dígitos y +); null si no parece un teléfono. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function resolveFooterContact(config: FooterConfig, profile: FooterProfile | null | undefined): ResolvedFooterContact {
  const phoneText = config.contact.phone || profile?.phone || ''
  const tel = phoneText ? telHref(phoneText) : null
  const locationText = config.contact.location || profile?.location || ''
  const mapQuery = config.contact.location || profile?.mapQuery || profile?.location || ''
  return {
    phone: tel ? { label: phoneText, href: tel } : null,
    hours: config.contact.hours,
    location: locationText ? { label: locationText, mapUrl: config.contact.showMap && mapQuery ? googleMapsSearchUrl(mapQuery) : null } : null,
  }
}

/** Las redes que se enseñan: las elegidas en el pie o, sin elegir, las del Brand Kit; sólo URLs válidas. */
export function resolveFooterSocial(config: FooterConfig, profile: FooterProfile | null | undefined): FooterSocialLink[] {
  const list = config.social ?? profile?.social ?? []
  const out: FooterSocialLink[] = []
  for (const s of list) {
    const url = validSocialUrl(s.network, s.url)
    if (url && !out.some((o) => o.network === s.network)) out.push({ network: s.network, url })
  }
  return out
}

// ---------------------------------------------------------------------------
// Colores: los de la empresa, siempre legibles
// ---------------------------------------------------------------------------

type Rgb = [number, number, number]
function parseHex(v: string | null | undefined): Rgb | null {
  if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return null
  const n = parseInt(v.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: Rgb) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
const contrastWithWhite = (c: Rgb) => 1.05 / (relativeLuminance(c) + 0.05)

/** Oscurece (mismo tono) hasta que el texto blanco tenga al menos `min` de contraste. */
export function darkenForWhiteText(color: string, min = 4.5): string {
  let c = parseHex(color)
  if (!c) return color
  for (let i = 0; i < 40 && contrastWithWhite(c) < min; i++) c = c.map((x) => x * 0.92) as Rgb
  return toHex(c)
}

/** Los colores de partida: blanco cálido, etiquetas melocotón suave y la tinta de la web. */
export const FOOTER_DEFAULT_COLORS = {
  background: '#fbf8f3',
  text: '#57524a',
  headingBackground: '#f6e3d3',
  headingText: '#6b3f26',
  ink: '#1c1b17',
}

export interface FooterPalette {
  background: string
  text: string
  headingBackground: string
  headingText: string
  /** Botón del newsletter e iconos al pasar el ratón (texto blanco encima). */
  accent: string
  bottomBackground: string
  bottomText: string
}

/**
 * La paleta del pie: lo elegido en el Constructor o, sin elegir, la de
 * partida con el color de la empresa en el botón del newsletter, en los
 * iconos sociales y en la barra inferior (oscurecido hasta que el texto
 * blanco se lea bien). Sin color de marca, la tinta de la web.
 */
export function footerPalette(design: FooterConfig['design'], brandColor: string | null | undefined): FooterPalette {
  const brand = parseHex(brandColor) ? brandColor! : FOOTER_DEFAULT_COLORS.ink
  const accent = darkenForWhiteText(design.accent || brand)
  return {
    background: design.background || FOOTER_DEFAULT_COLORS.background,
    text: design.text || FOOTER_DEFAULT_COLORS.text,
    headingBackground: design.headingBackground || FOOTER_DEFAULT_COLORS.headingBackground,
    headingText: design.headingText || FOOTER_DEFAULT_COLORS.headingText,
    accent,
    bottomBackground: design.bottomBackground || darkenForWhiteText(brand, 7),
    bottomText: design.bottomText || '#f4f1ea',
  }
}

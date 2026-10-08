import { messages } from '../../i18n/messages'

/**
 * Las páginas de la web que se editan con el Constructor Web — la única
 * lista: la usan el panel «Páginas» del editor, la API (qué `pageKey`
 * existe) y las páginas públicas (qué documento piden).
 *
 * Tres clases de página:
 *  - `home`: la portada, hecha sólo de secciones (como siempre).
 *  - `content`: páginas de contenido (Nosotros, Servicios, Contacto). Al
 *    abrirlas por primera vez en el editor el borrador se siembra con lo que
 *    la página ya enseña, así que se edita la página real y no una en blanco.
 *    Mientras no se publique una versión, la web sigue con su contenido de
 *    siempre.
 *  - `functional`: páginas con un núcleo que se rellena solo (el listado de
 *    propiedades, la ficha, el blog). Ese núcleo es una zona dinámica fija
 *    —el bloque `page-core`: no se borra, no se duplica, no se oculta— y
 *    alrededor se añaden las secciones que se quiera, encima o debajo.
 */

export type SitePageKind = 'home' | 'content' | 'functional'

/** Núcleos dinámicos: cada página funcional tiene exactamente uno, el suyo. */
export type PageCoreKind = 'properties-listing' | 'property-detail' | 'blog-index'

export const PAGE_CORE_TYPE = 'page-core'

export interface SitePageDef {
  key: string
  label: string
  /** Dirección pública. La ficha no tiene una sola: es la de cada propiedad. */
  path: string
  kind: SitePageKind
  /** Sólo las funcionales: qué zona dinámica llevan. */
  core?: PageCoreKind
  /** Una frase para el panel de páginas del editor. */
  hint: string
}

export const SITE_PAGES: SitePageDef[] = [
  { key: 'home', label: 'Inicio', path: '/', kind: 'home', hint: 'La portada de tu web.' },
  { key: 'propiedades', label: 'Propiedades', path: '/propiedades', kind: 'functional', core: 'properties-listing', hint: 'El listado con buscador y filtros se rellena solo; añade secciones encima o debajo.' },
  { key: 'ficha-propiedad', label: 'Ficha de propiedad', path: '/propiedades/…', kind: 'functional', core: 'property-detail', hint: 'La plantilla de todas las fichas: la ficha se rellena sola con cada propiedad; añade secciones encima o debajo.' },
  { key: 'vender', label: 'Vender Propiedad', path: '/vender', kind: 'content', hint: 'Para propietarios que quieren vender: su formulario crea el lead de captación en tu CRM.' },
  { key: 'nosotros', label: 'Nosotros', path: '/nosotros', kind: 'content', hint: 'Tu historia y tu equipo.' },
  { key: 'servicios', label: 'Servicios', path: '/servicios', kind: 'content', hint: 'Una página nueva: existe en tu web desde que la publicas.' },
  { key: 'contacto', label: 'Contacto', path: '/contacto', kind: 'content', hint: 'El formulario crea un lead real en tu CRM.' },
  { key: 'blog', label: 'Blog', path: '/blog', kind: 'functional', core: 'blog-index', hint: 'Los artículos se rellenan solos desde Blog & CMS; añade secciones encima o debajo.' },
]

export const SITE_PAGE_KEYS = SITE_PAGES.map((p) => p.key)

export function sitePageDef(key: string | null | undefined): SitePageDef | null {
  return SITE_PAGES.find((p) => p.key === key) || null
}

export const PAGE_CORE_LABELS: Record<PageCoreKind, string> = {
  'properties-listing': 'Listado de propiedades',
  'property-detail': 'Ficha de la propiedad',
  'blog-index': 'Listado de artículos',
}

/** Dónde se gestiona, en el panel, lo que enseña cada zona dinámica. */
export const PAGE_CORE_SOURCES: Record<PageCoreKind, { label: string; to: string }> = {
  'properties-listing': { label: 'Propiedades (web)', to: '/admin/developer-properties' },
  'property-detail': { label: 'Propiedades (web)', to: '/admin/developer-properties' },
  'blog-index': { label: 'Artículos', to: '/admin/cms/articles' },
}

/**
 * Lo poco que se puede ajustar de una zona dinámica (sin tocar sus datos,
 * que siguen saliendo de Property Core): de momento, en la ficha, la
 * sección «Propiedades destacadas» bajo las similares — mostrarla u
 * ocultarla y su título. Todo lo demás del contenido de la zona se descarta
 * al guardar.
 */
export const PAGE_CORE_OPTIONS: Partial<Record<PageCoreKind, Record<string, 'boolean' | 'text'>>> = {
  'property-detail': { showFeatured: 'boolean', featuredTitle: 'text' },
}

const CORE_TEXT_MAX = 120

export function sanitizeCoreOptions(core: PageCoreKind, content: Record<string, any> | null | undefined): Record<string, boolean | string> {
  const spec = PAGE_CORE_OPTIONS[core] || {}
  const out: Record<string, boolean | string> = {}
  for (const [key, type] of Object.entries(spec)) {
    const v = content?.[key]
    if (type === 'boolean' && typeof v === 'boolean') out[key] = v
    if (type === 'text' && typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, CORE_TEXT_MAX)
  }
  return out
}

interface SeedBlock {
  id: string
  type: string
  version: number
  content: Record<string, any>
}

/** El texto en español que la página enseña hoy (i18n/messages.ts), para sembrar el borrador con él. */
function es(key: string): string {
  return messages.es?.[key] ?? key
}

/**
 * El primer borrador de una página: lo que la web ya enseña en esa
 * dirección, hecho secciones del Constructor. `home` arranca vacía, como
 * siempre (es la única que ya existía en el editor).
 */
export function seedPageBlocks(key: string): SeedBlock[] {
  const def = sitePageDef(key)
  if (!def || def.kind === 'home') return []
  if (def.kind === 'functional') return [{ id: PAGE_CORE_TYPE, type: PAGE_CORE_TYPE, version: 1, content: { core: def.core } }]
  switch (key) {
    case 'nosotros':
      return [
        {
          id: 'text-nosotros',
          type: 'text',
          version: 1,
          content: {
            eyebrow: es('aboutUs.hero.eyebrow'),
            title: es('aboutUs.hero.title'),
            subtitle: '',
            body: `${es('aboutUs.body.paragraph1')}\n\n${es('aboutUs.body.paragraph2')}`,
            align: 'left',
            maxWidth: 'md',
            columns: 1,
          },
        },
        {
          id: 'cta-nosotros',
          type: 'cta',
          version: 1,
          content: {
            eyebrow: '',
            title: '',
            description: '',
            ctaPrimary: es('aboutUs.cta.browse'),
            ctaPrimaryTo: '/propiedades',
            ctaSecondary: es('aboutUs.cta.talk'),
            ctaSecondaryTo: '/contacto',
            align: 'center',
          },
        },
      ]
    case 'contacto':
      return [
        {
          id: 'lead-form-contacto',
          type: 'lead-form',
          version: 1,
          content: {
            eyebrow: '',
            title: es('contact.title'),
            description: es('contact.subtitle'),
            submitLabel: es('contact.form.submit'),
            messageLabel: es('contact.form.messageLabel').replace(/\s*\*$/, ''),
            messagePlaceholder: '',
            successMessage: es('contact.form.success'),
            subject: 'Página de contacto',
            privacyNote: '',
            showPhone: true,
            layout: 'centered',
          },
        },
      ]
    case 'vender':
      // «Vender Propiedad» del menú (utils/siteNav.ts). La web la enseña desde
      // el primer día con este contenido; la inmobiliaria lo cambia y lo
      // publica cuando quiera. El formulario es de captación (`purpose: 'seller'`).
      return [
        {
          id: 'text-vender',
          type: 'text',
          version: 1,
          content: {
            eyebrow: 'Vender Propiedad',
            title: '¿Quieres vender tu vivienda?',
            subtitle: '',
            body: 'Cuéntanos qué quieres vender y te ayudamos con todo el proceso: el precio, la presentación del inmueble, las visitas y la negociación con los compradores.\n\nDéjanos tus datos y te llamamos para conocer tu propiedad, sin compromiso.',
            align: 'left',
            maxWidth: 'md',
            columns: 1,
          },
        },
        {
          id: 'lead-form-vender',
          type: 'lead-form',
          version: 1,
          content: {
            eyebrow: '',
            title: 'Cuéntanos qué quieres vender',
            description: 'Te contactamos para conocer tu propiedad.',
            submitLabel: 'Quiero vender',
            messageLabel: 'Tu propiedad',
            messagePlaceholder: 'Tipo de vivienda, zona o dirección, metros, habitaciones…',
            successMessage: 'Gracias. Te llamaremos lo antes posible para hablar de tu propiedad.',
            subject: 'Vender propiedad',
            purpose: 'seller',
            privacyNote: '',
            showPhone: true,
            layout: 'centered',
          },
        },
      ]
    case 'servicios':
      // No hay página de servicios en la web: se empieza con una estructura
      // que la inmobiliaria rellena, y existe en /servicios cuando la publica.
      return [
        {
          id: 'text-servicios',
          type: 'text',
          version: 1,
          content: {
            eyebrow: 'Servicios',
            title: 'Lo que hacemos por ti',
            subtitle: '',
            body: 'Cuenta aquí qué servicios ofreces: compra, venta, alquiler, valoración, gestión…',
            align: 'left',
            maxWidth: 'md',
            columns: 1,
          },
        },
        {
          id: 'cta-servicios',
          type: 'cta',
          version: 1,
          content: { eyebrow: '', title: '¿Hablamos de tu próxima propiedad?', description: '', ctaPrimary: 'Contactar', ctaPrimaryTo: '/contacto', ctaSecondary: '', ctaSecondaryTo: '', align: 'center' },
        },
      ]
    default:
      return []
  }
}

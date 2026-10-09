import { messages } from '../../i18n/messages'
import { compactEnergyOptions, normalizeEnergyOptions, type EnergyDisplayOptions } from '../energyCertificate'

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
 * que siguen saliendo de Property Core): en la ficha, la sección
 * «Propiedades destacadas» bajo las similares —mostrarla u ocultarla y su
 * título— y el orden y la visibilidad de sus secciones (#110); en el
 * catálogo, el orden y la visibilidad de los grupos del panel de filtros.
 * Todo lo demás del contenido de la zona se descarta al guardar.
 */
export const PAGE_CORE_OPTIONS: Partial<Record<PageCoreKind, Record<string, 'boolean' | 'text' | 'sections' | 'filters' | 'operation' | 'tone' | 'energy'>>> = {
  // Ficha: destacadas, orden y visibilidad de las secciones (#110) y, en la
  // tarjeta principal, la referencia y la descripción; el fondo de «Atendido
  // por», la presentación de la tabla energética y si las secciones sin datos
  // se ocultan solas (megaprompt «ficha»).
  'property-detail': {
    showFeatured: 'boolean',
    featuredTitle: 'text',
    sections: 'sections',
    showReference: 'boolean',
    showDescription: 'boolean',
    hideEmpty: 'boolean',
    contactTone: 'tone',
    energy: 'energy',
  },
  // Catálogo: qué partes del buscador se enseñan y cómo arranca. Sólo
  // presentación: lo que se encuentra lo decide Property Search, no esto.
  'properties-listing': { filters: 'filters', showPanel: 'boolean', showOperation: 'boolean', showSort: 'boolean', showNewSearch: 'boolean', defaultOperation: 'operation' },
}

/** Lo que el catálogo enseña si el Constructor no dice otra cosa: todo, y «Comprar» de partida. */
export interface CatalogDisplayOptions {
  showPanel: boolean
  showOperation: boolean
  showSort: boolean
  showNewSearch: boolean
  defaultOperation: 'venta' | 'alquiler'
}
export function catalogDisplayOptions(content: Record<string, any> | null | undefined): CatalogDisplayOptions {
  return {
    showPanel: content?.showPanel !== false,
    showOperation: content?.showOperation !== false,
    showSort: content?.showSort !== false,
    showNewSearch: content?.showNewSearch !== false,
    defaultOperation: content?.defaultOperation === 'alquiler' ? 'alquiler' : 'venta',
  }
}

/** «Atendido por»: fondo suave del color de la marca (de partida), blanco o un color propio. */
export type ContactTone = 'brand' | 'white' | `#${string}`
export function parseContactTone(v: unknown): ContactTone | null {
  if (v === 'brand' || v === 'white') return v
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? (v.toLowerCase() as ContactTone) : null
}

/** Lo que la ficha enseña si el Constructor no dice otra cosa. */
export interface FichaDisplayOptions {
  showReference: boolean
  showDescription: boolean
  hideEmpty: boolean
  contactTone: ContactTone
  energy: EnergyDisplayOptions
}
/**
 * La descripción era una sección más de la lista (hasta el megaprompt
 * «ficha»): una web que la había ocultado ahí la sigue teniendo oculta.
 */
function legacyDescriptionHidden(sections: unknown): boolean {
  return Array.isArray(sections) && sections.some((s) => s?.key === 'descripcion' && s.visible === false)
}
export function fichaDisplayOptions(content: Record<string, any> | null | undefined): FichaDisplayOptions {
  return {
    showReference: content?.showReference !== false,
    showDescription: typeof content?.showDescription === 'boolean' ? content.showDescription : !legacyDescriptionHidden(content?.sections),
    hideEmpty: content?.hideEmpty !== false,
    contactTone: parseContactTone(content?.contactTone) || 'brand',
    energy: normalizeEnergyOptions(content?.energy),
  }
}

/**
 * Las secciones de la ficha que el Constructor puede ordenar u ocultar (#110),
 * en su orden de partida: la jerarquía del encargo (datos clave, descripción,
 * características, plano y estado, edificio y documentación, hipoteca,
 * ubicación) y, después, el resto, que se mantiene. La galería, la cabecera
 * de la propiedad, el contacto y las similares no se mueven. Una sección sin
 * datos no sale aunque esté visible: el Constructor decide la presentación,
 * Property Core los datos.
 */
export const FICHA_SECTIONS: { key: string; label: string }[] = [
  // El orden de partida es el de la ficha de la referencia (#111): bajo la
  // galería y la tarjeta principal, las características, la descripción, el
  // Score, plano y estado, edificio y documentación; después, el resto.
  // La descripción ya no es una sección: va en la tarjeta principal, bajo el
  // título y la ubicación (se oculta con «Descripción» en las opciones).
  { key: 'datos', label: 'Características destacadas' },
  { key: 'energia', label: 'Eficiencia energética' },
  { key: 'score', label: 'Serendipia Score' },
  { key: 'plano-estado', label: 'Plano y estado del inmueble' },
  { key: 'edificio-documentacion', label: 'El edificio y documentación' },
  { key: 'comodidades', label: 'Comodidades' },
  { key: 'mas-informacion', label: 'Más información' },
  { key: 'tipologias', label: 'Tipologías' },
  { key: 'resumen', label: 'Lo que debes saber' },
  { key: 'analisis', label: 'Análisis de inversión' },
  { key: 'precio', label: 'Evolución de precio' },
  { key: 'servicios', label: 'Estilo de vida' },
  { key: 'ubicacion', label: 'Ubicación' },
  { key: 'orientacion', label: 'Sol y orientación' },
  { key: 'hipoteca', label: 'Hipoteca y costes' },
  { key: 'preguntar', label: 'Pregúntale' },
  { key: 'staging', label: 'Visualiza el potencial' },
  { key: 'historia', label: 'Historia del inmueble' },
]

export interface FichaSectionSetting {
  key: string
  visible: boolean
  /** Sólo en los grupos de filtros del catálogo: abierto al cargar la página. */
  open?: boolean
}

/**
 * Una lista ordenable de la zona (secciones de la ficha, grupos de filtros),
 * completa y en orden: las conocidas que vengan (sin repetir) y, detrás, las
 * que falten, visibles — así una sección o un filtro nuevo del código aparece
 * solo en las webs que ya habían guardado su orden.
 */
function normalizeOrderedList(value: unknown, catalog: { key: string }[], anchors: Record<string, string> = {}): FichaSectionSetting[] {
  const known = new Set(catalog.map((x) => x.key))
  const out: FichaSectionSetting[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(value) ? value : []) {
    const key = typeof item?.key === 'string' ? item.key : ''
    if (!known.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ key, visible: item.visible !== false, ...(item.open === true ? { open: true } : {}) })
  }
  for (const x of catalog) if (!seen.has(x.key) && !anchors[x.key]) out.push({ key: x.key, visible: true })
  // Una sección nueva con sitio propio (p. ej. la tabla energética, junto a las
  // características) entra ahí también en las webs que ya guardaron su orden.
  for (const x of catalog) {
    if (seen.has(x.key) || !anchors[x.key]) continue
    const at = out.findIndex((y) => y.key === anchors[x.key])
    out.splice(at >= 0 ? at + 1 : out.length, 0, { key: x.key, visible: true })
  }
  return out
}

/** Dónde entra una sección nueva de la ficha en un orden ya guardado. */
const FICHA_SECTION_ANCHORS: Record<string, string> = { energia: 'datos' }

export function normalizeFichaSections(value: unknown): FichaSectionSetting[] {
  return normalizeOrderedList(value, FICHA_SECTIONS, FICHA_SECTION_ANCHORS)
}

/**
 * Los grupos del panel de filtros del catálogo (components/catalog/CatalogFilters.vue)
 * que el Constructor puede ordenar u ocultar, en su orden de partida (el de
 * la referencia de #109). Ocultar un grupo sólo lo quita del panel: un
 * filtro que ya venga en la dirección se sigue aplicando y se puede quitar
 * desde su chip. «Más filtros» y el botón de resultados no se mueven.
 */
export const CATALOG_FILTER_GROUPS: { key: string; label: string }[] = [
  { key: 'location', label: 'Ubicación' },
  { key: 'price', label: 'Precio' },
  { key: 'area', label: 'Superficie' },
  { key: 'bedrooms', label: 'Habitaciones' },
  { key: 'bathrooms', label: 'Baños' },
  { key: 'type', label: 'Tipo de propiedad' },
  { key: 'status', label: 'Estado' },
  { key: 'situation', label: 'Situación de la vivienda' },
  { key: 'rental', label: 'Tipo de alquiler (con «Alquilar»)' },
  { key: 'features', label: 'Características' },
]

export function normalizeCatalogFilters(value: unknown): FichaSectionSetting[] {
  return normalizeOrderedList(value, CATALOG_FILTER_GROUPS)
}

/** Para pintar el panel: las claves de los grupos visibles, en su orden. */
export function catalogFilterKeys(value: unknown): string[] {
  return normalizeCatalogFilters(value)
    .filter((x) => x.visible)
    .map((x) => x.key)
}

/**
 * Los grupos abiertos al cargar el catálogo. Sin nada marcado en el
 * Constructor, Ubicación (como siempre); si se oculta, el primero visible.
 */
export function catalogFilterOpenKeys(value: unknown): string[] {
  const list = normalizeCatalogFilters(value).filter((x) => x.visible)
  const marked = list.filter((x) => x.open).map((x) => x.key)
  if (marked.length) return marked
  return list.some((x) => x.key === 'location') ? ['location'] : list.slice(0, 1).map((x) => x.key)
}

/** Para pintar la ficha: el puesto de cada sección y cuáles están ocultas. */
export function fichaSectionLayout(value: unknown): { order: Record<string, number>; hidden: Set<string> } {
  const list = normalizeFichaSections(value)
  return { order: Object.fromEntries(list.map((x, i) => [x.key, i + 1])), hidden: new Set(list.filter((x) => !x.visible).map((x) => x.key)) }
}

const CORE_TEXT_MAX = 120

export function sanitizeCoreOptions(core: PageCoreKind, content: Record<string, any> | null | undefined): Record<string, boolean | string | FichaSectionSetting[] | Partial<EnergyDisplayOptions>> {
  const spec = PAGE_CORE_OPTIONS[core] || {}
  const out: Record<string, boolean | string | FichaSectionSetting[] | Partial<EnergyDisplayOptions>> = {}
  for (const [key, type] of Object.entries(spec)) {
    const v = content?.[key]
    if (type === 'boolean' && typeof v === 'boolean') out[key] = v
    if (type === 'text' && typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, CORE_TEXT_MAX)
    if (type === 'sections' && Array.isArray(v)) out[key] = normalizeFichaSections(v)
    if (type === 'filters' && Array.isArray(v)) out[key] = normalizeCatalogFilters(v)
    if (type === 'operation' && (v === 'venta' || v === 'alquiler')) out[key] = v
    if (type === 'tone' && parseContactTone(v)) out[key] = parseContactTone(v)!
    if (type === 'energy' && v && typeof v === 'object') {
      const compact = compactEnergyOptions(normalizeEnergyOptions(v))
      if (Object.keys(compact).length) out[key] = compact
    }
  }
  // Al guardar, la descripción oculta en la lista antigua pasa a su interruptor.
  if (core === 'property-detail' && typeof out.showDescription !== 'boolean' && legacyDescriptionHidden(content?.sections)) out.showDescription = false
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

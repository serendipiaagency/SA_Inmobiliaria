import { messages } from '../../i18n/messages'
import { compactEnergyOptions, normalizeEnergyOptions, type EnergyDisplayOptions } from '../energyCertificate'
import { normalizeFeaturedLocations, searchLocationOptions, searchTypeOptions, type FeaturedLocation, type SearchLocationOptions, type SearchTypeOptions } from '../searchConfig'
import { compactGalleryOptions, normalizeGalleryOptions, type GalleryDisplayOptions } from '../mediaGallery'

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
export type PageCoreOptionKind = 'boolean' | 'text' | 'number' | 'sections' | 'filters' | 'operation' | 'tone' | 'energy' | 'locations' | 'gallery' | 'choice'
export const PAGE_CORE_OPTIONS: Partial<Record<PageCoreKind, Record<string, PageCoreOptionKind>>> = {
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
    // Galería multimedia (Cola 5): sólo presentación (utils/mediaGallery.ts); las categorías las decide el backend.
    gallery: 'gallery',
    // Ficha editable (Cola 7): cuántas líneas de la descripción se ven antes de «Ver más», las columnas de los datos clave y la altura del mapa.
    descriptionLines: 'choice',
    factsColumns: 'choice',
    mapHeight: 'choice',
  },
  // Catálogo: qué partes del buscador se enseñan y cómo arranca. Sólo
  // presentación: lo que se encuentra lo decide Property Search, no esto.
  'properties-listing': {
    filters: 'filters',
    showPanel: 'boolean',
    showOperation: 'boolean',
    showSort: 'boolean',
    showNewSearch: 'boolean',
    defaultOperation: 'operation',
    // «Tipo de inmueble» y «Ubicación» del panel (utils/searchConfig.ts): las mismas claves que en el Hero.
    typePlaceholder: 'text',
    typeShowCounts: 'boolean',
    locationPlaceholder: 'text',
    locationSuggestions: 'number',
    locationShowCounts: 'boolean',
    locationFeatured: 'locations',
    locationMapSelect: 'boolean',
    locationMapDraw: 'boolean',
    locationMapNearby: 'boolean',
  },
}

/** Lo que el catálogo enseña si el Constructor no dice otra cosa: todo, y «Comprar» de partida. */
export interface CatalogDisplayOptions {
  showPanel: boolean
  showOperation: boolean
  showSort: boolean
  showNewSearch: boolean
  defaultOperation: 'venta' | 'alquiler'
  /** «Tipo de inmueble» y «Ubicación» del panel: las mismas opciones que en el Hero (utils/searchConfig.ts). */
  type: SearchTypeOptions
  location: SearchLocationOptions
}
export function catalogDisplayOptions(content: Record<string, any> | null | undefined): CatalogDisplayOptions {
  return {
    showPanel: content?.showPanel !== false,
    showOperation: content?.showOperation !== false,
    showSort: content?.showSort !== false,
    showNewSearch: content?.showNewSearch !== false,
    defaultOperation: content?.defaultOperation === 'alquiler' ? 'alquiler' : 'venta',
    type: searchTypeOptions(content),
    location: searchLocationOptions(content),
  }
}

/** «Atendido por»: fondo suave del color de la marca (de partida), blanco o un color propio. */
export type ContactTone = 'brand' | 'white' | `#${string}`
export function parseContactTone(v: unknown): ContactTone | null {
  if (v === 'brand' || v === 'white') return v
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? (v.toLowerCase() as ContactTone) : null
}

/**
 * Las opciones «de elección» de la ficha: un valor de una lista cerrada. La
 * primera clave es la que guarda la plantilla; `fallback` es lo que enseña la
 * web sin personalizar (y lo que no se guarda). Cualquier otro valor se
 * descarta al guardar.
 */
export const FICHA_CHOICES = {
  /** Líneas de la descripción antes de «Ver más» (la web de siempre enseña 4). */
  descriptionLines: { values: [3, 4, 6, 8, 12], fallback: 4 },
  /** Columnas de los datos clave en escritorio: `auto` es la fila con separadores de siempre. */
  factsColumns: { values: ['auto', 2, 3, 4], fallback: 'auto' },
  /** Altura del mapa de «Ubicación». */
  mapHeight: { values: ['compact', 'standard', 'tall'], fallback: 'standard' },
} as const satisfies Record<string, { values: readonly (string | number)[]; fallback: string | number }>
export type FichaChoiceKey = keyof typeof FICHA_CHOICES

/** El valor de una opción de elección: el guardado si está en la lista y, si no, el de partida. */
export function fichaChoice(content: Record<string, any> | null | undefined, key: FichaChoiceKey): string | number {
  const spec = FICHA_CHOICES[key]
  const v = content?.[key]
  const found = (spec.values as readonly (string | number)[]).find((x) => x === v || String(x) === String(v))
  return found !== undefined ? found : spec.fallback
}

/** Lo que la ficha enseña si el Constructor no dice otra cosa. */
export interface FichaDisplayOptions {
  showReference: boolean
  showDescription: boolean
  hideEmpty: boolean
  contactTone: ContactTone
  energy: EnergyDisplayOptions
  gallery: GalleryDisplayOptions
  descriptionLines: number
  factsColumns: 'auto' | 2 | 3 | 4
  mapHeight: 'compact' | 'standard' | 'tall'
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
    gallery: normalizeGalleryOptions(content?.gallery),
    descriptionLines: fichaChoice(content, 'descriptionLines') as number,
    factsColumns: fichaChoice(content, 'factsColumns') as FichaDisplayOptions['factsColumns'],
    mapHeight: fichaChoice(content, 'mapHeight') as FichaDisplayOptions['mapHeight'],
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
  { key: 'exposicion', label: 'Exposición solar' },
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
const FICHA_SECTION_ANCHORS: Record<string, string> = { energia: 'datos', exposicion: 'ubicacion' }

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

export function sanitizeCoreOptions(core: PageCoreKind, content: Record<string, any> | null | undefined): Record<string, boolean | string | number | FichaSectionSetting[] | FeaturedLocation[] | Partial<EnergyDisplayOptions> | Partial<GalleryDisplayOptions>> {
  const spec = PAGE_CORE_OPTIONS[core] || {}
  const out: Record<string, boolean | string | number | FichaSectionSetting[] | FeaturedLocation[] | Partial<EnergyDisplayOptions> | Partial<GalleryDisplayOptions>> = {}
  for (const [key, type] of Object.entries(spec)) {
    const v = content?.[key]
    if (type === 'boolean' && typeof v === 'boolean') out[key] = v
    if (type === 'text' && typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, CORE_TEXT_MAX)
    if (type === 'number' && v !== '' && v !== null && Number.isFinite(Number(v))) out[key] = Number(v)
    if (type === 'locations' && Array.isArray(v)) {
      const list = normalizeFeaturedLocations(v)
      if (list.length) out[key] = list
    }
    if (type === 'sections' && Array.isArray(v)) out[key] = normalizeFichaSections(v)
    if (type === 'filters' && Array.isArray(v)) out[key] = normalizeCatalogFilters(v)
    if (type === 'operation' && (v === 'venta' || v === 'alquiler')) out[key] = v
    if (type === 'tone' && parseContactTone(v)) out[key] = parseContactTone(v)!
    // Una opción de elección sólo se guarda si es de la lista y difiere de lo de partida.
    if (type === 'choice' && key in FICHA_CHOICES) {
      const picked = fichaChoice({ [key]: v }, key as FichaChoiceKey)
      if (picked !== FICHA_CHOICES[key as FichaChoiceKey].fallback) out[key] = picked
    }
    if (type === 'energy' && v && typeof v === 'object') {
      const compact = compactEnergyOptions(normalizeEnergyOptions(v))
      if (Object.keys(compact).length) out[key] = compact
    }
    if (type === 'gallery' && v && typeof v === 'object') {
      const compact = compactGalleryOptions(normalizeGalleryOptions(v))
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
  /** Fondo/estilo de sección (p. ej. { background: 'surface' }); lo sanea validatePageDocument. */
  style?: Record<string, any>
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
      // «Nosotros» arranca como una composición editorial de bloques
      // independientes (Cola 14), no un único bloque de texto: historia,
      // valores, cifras de la agencia, equipo (conectado a Comerciales) y
      // cierre. Cada bloque se reordena, se oculta o se edita por separado.
      // El equipo y las cifras se rellenan solos cuando la inmobiliaria
      // publica sus comerciales; hasta entonces el bloque de equipo enseña
      // un aviso, sin romper la página.
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
          id: 'trust-nosotros',
          type: 'trust-points',
          version: 1,
          style: { background: 'surface' },
          content: {
            eyebrow: 'Por qué elegirnos',
            title: 'Experiencia local. Tu tranquilidad.',
            text: '',
            image: '',
            imageAlt: '',
            count: 4,
            point1Title: 'Conocemos la zona',
            point1Text: 'Asesoramiento basado en el conocimiento real del territorio y de sus particularidades.',
            point2Title: 'Atención personal',
            point2Text: 'Un profesional que te acompaña en cada paso, con un trato cercano y transparente.',
            point3Title: 'Todo en un solo lugar',
            point3Text: 'Compra, venta, alquiler y asesoramiento financiero, de la mano de un mismo equipo.',
            point4Title: 'Tu confianza es lo primero',
            point4Text: 'Información clara y honesta para que tomes decisiones con seguridad.',
          },
        },
        {
          id: 'about-nosotros',
          type: 'about-agency',
          version: 1,
          content: {
            eyebrow: 'Nuestra inmobiliaria',
            title: 'Mucho más que encontrar una casa.',
            text: 'Conocemos nuestro territorio, sus personas y sus oportunidades. Te acompañamos en todo el proceso —valoración, visitas, financiación y firma— para que encuentres un lugar donde de verdad quieras vivir.',
            cta: 'Habla con el equipo',
            ctaTo: '/contacto',
            image: '',
            imageAlt: '',
            stats: ['team', 'offices', 'properties'],
          },
        },
        {
          id: 'team-nosotros',
          type: 'team',
          version: 1,
          content: {
            eyebrow: 'Nuestro equipo',
            title: 'Las personas detrás de cada operación.',
            text: 'Un equipo cercano y con conocimiento real del mercado. Estamos a tu lado para ayudarte a tomar la mejor decisión.',
            cta: 'Conoce todo el equipo',
            ctaTo: '/equipo',
            source: 'dynamic',
            limit: 8,
            layout: 'editorial',
            cardFields: { position: true, description: true, specialties: true, contact: true },
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
      // publica cuando quiera. El formulario es el de valoración de propiedad (`seller-valuation`): crea el lead de captación.
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
          id: 'seller-valuation-vender',
          type: 'seller-valuation',
          version: 1,
          content: {
            eyebrow: 'Valoración sin compromiso',
            title: 'Cuéntanos qué quieres vender',
            description: 'Responde unas preguntas sobre tu propiedad y un comercial te contactará para hablar de ella.',
            submitLabel: 'Enviar mi propiedad',
            successMessage: 'Hemos recibido los datos de tu propiedad',
            subject: 'Vender propiedad',
            privacyNote: '',
          },
        },
      ]
    case 'servicios':
      // No hay página de servicios en la web: se empieza con una estructura
      // que la inmobiliaria rellena, y existe en /servicios cuando la publica.
      // Arranca con el bloque «Servicios» (Cola 25): composición editorial a
      // dos columnas con seis servicios reales de una inmobiliaria, listos
      // para que la agencia los ajuste; y un cierre.
      return [
        {
          id: 'services-servicios',
          type: 'services',
          version: 1,
          content: {
            eyebrow: 'Servicios',
            title: 'Todo lo que hacemos por ti.',
            text: 'Te acompañamos en cada paso, desde la primera visita hasta la firma, con un equipo que conoce de verdad tu zona.',
            image: '',
            imageAlt: '',
            service1Icon: 'propertyType',
            service1Title: 'Compra de vivienda',
            service1Text: 'Encontramos la casa que buscas y te guiamos en la negociación y la firma.',
            service2Icon: 'area',
            service2Title: 'Venta y valoración',
            service2Text: 'Ponemos precio a tu propiedad con datos reales del mercado y la presentamos para vender mejor.',
            service3Icon: 'building',
            service3Title: 'Alquiler',
            service3Text: 'Gestionamos el alquiler de principio a fin, con inquilinos solventes y contratos claros.',
            service4Icon: 'concierge',
            service4Title: 'Asesoramiento personal',
            service4Text: 'Un profesional de referencia que resuelve tus dudas y defiende tus intereses.',
            service5Icon: 'renovation',
            service5Title: 'Reformas y proyectos',
            service5Text: 'Te ayudamos a sacar el máximo partido a tu inmueble antes de venderlo o habitarlo.',
            service6Icon: 'energyRating',
            service6Title: 'Trámites y certificados',
            service6Text: 'Nos ocupamos de la documentación, el certificado energético y la gestión con notaría.',
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

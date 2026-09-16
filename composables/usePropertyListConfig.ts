/**
 * Declarative per-resource configuration for the property **listing**
 * (components/property-list/PropertyList.vue) — the counterpart to
 * PROPERTY_BUILDER_SECTIONS in usePropertyBuilderConfig.ts, which does the
 * same job for the **editor**.
 *
 * ## Por qué existe
 *
 * `pages/admin/properties/index.vue` (330 líneas) y
 * `pages/admin/developer-properties/index.vue` (327) eran variantes del mismo
 * listado: normalizando el nombre del recurso quedaban 95 líneas de
 * diferencia. Toda mejora —un filtro, una columna, una acción— había que
 * hacerla dos veces, y en cuanto una se olvidara los dos módulos divergían.
 * Es el hallazgo RE06 de la auditoría pre-piloto.
 *
 * El editor ya había resuelto exactamente esto (un solo `PropertyBuilder.vue`
 * configurado por `resource`); esto es lo mismo para el listado.
 *
 * ## Qué va aquí y qué no
 *
 * Aquí van **las diferencias**, declaradas: título, placeholder, estados,
 * orden, qué pinta cada fila, qué hace la acción principal. Lo que comparten
 * —buscador, filtros avanzados, chips, paginación, duplicar, eliminar,
 * cuadrícula/lista con preferencia recordada— vive una sola vez en el
 * componente y no se declara.
 *
 * **Añadir un tercer catálogo de propiedades es añadir una entrada aquí y
 * otra en PROPERTY_BUILDER_SECTIONS, no escribir otra página.**
 */

/** Los tonos que usa la celda de estado. Cerrados a propósito: si hiciera falta uno nuevo es una decisión de diseño, no un color suelto en una plantilla. */
export type ListChipTone = 'neutral' | 'muted' | 'positive' | 'strong'

export interface ListChip {
  label: string
  tone: ListChipTone
}

export interface PropertyListConfig {
  /** Segmento del recurso: vale a la vez para `/api/admin/<resource>` y para `/admin/<resource>`. */
  resource: string
  title: string
  /** Texto del `<h1>` y del `<title>` — son el mismo en los dos catálogos. */
  searchPlaceholder: string
  /** Clave de la preferencia cuadrícula/lista en localStorage, propia de cada catálogo. */
  viewStorageKey: string
  /** Qué tarjeta usa la vista de cuadrícula, y con qué evento avisa de la acción principal. */
  card: 'developer' | 'agent'
  cardToggleEvent: 'publish' | 'toggle-sold'
  statusOptions: { value: string; label: string }[]
  sortOptions: { value: string; label: string }[]
  /** Si el catálogo distingue venta de alquiler (sólo 2ª mano). */
  hasTransactionFilter: boolean

  // --- Cómo se pinta una fila de la vista de lista -------------------------
  rowTitle: (p: any) => string
  rowImage: (p: any) => string | null
  rowLocation: (p: any) => string
  rowChips: (p: any) => ListChip[]
  /** Enlace a la ficha pública, o null si este catálogo no tiene una. */
  previewHref: ((p: any) => string) | null

  /**
   * La acción principal propia del catálogo: publicar/despublicar en obra
   * nueva, vendida/disponible en 2ª mano. Es un PUT sobre el mismo endpoint
   * genérico en los dos casos — sólo cambia qué campo se toca.
   */
  toggle: {
    label: (p: any) => string
    body: (p: any) => Record<string, any>
    successMessage: (p: any) => string
    errorMessage: string
  }
}

const DEVELOPER_STATUS_LABELS: Record<string, string> = { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista' }
const AGENT_STATUS_LABELS: Record<string, string> = { available: 'Disponible', sold: 'Vendida' }

const BASE_SORT_OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguas' },
  { value: 'price_desc', label: 'Precio: más alto' },
  { value: 'price_asc', label: 'Precio: más bajo' },
]

export const PROPERTY_LIST_CONFIG: Record<string, PropertyListConfig> = {
  'developer-properties': {
    resource: 'developer-properties',
    title: 'Propiedades (web)',
    searchPlaceholder: 'Nombre, referencia, dirección, zona…',
    viewStorageKey: 'sa-admin-developer-properties-view',
    card: 'developer',
    cardToggleEvent: 'publish',
    statusOptions: Object.entries(DEVELOPER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    // Una promoción tiene nombre propio, así que ordenar por nombre significa
    // algo aquí; una vivienda de reventa no lo tiene (se identifica por
    // tipo + referencia), y por eso 2ª mano no ofrece esa opción.
    sortOptions: [...BASE_SORT_OPTIONS, { value: 'name_asc', label: 'Nombre A-Z' }, { value: 'name_desc', label: 'Nombre Z-A' }],
    hasTransactionFilter: false,

    rowTitle: (p) => p.name,
    rowImage: (p) => p.coverImage || null,
    rowLocation: (p) => [p.community, p.city, p.country].filter(Boolean).join(' · ') || '—',
    rowChips: (p) => [
      { label: DEVELOPER_STATUS_LABELS[p.status] || p.status, tone: 'neutral' },
      p.publishedAt ? { label: 'Publicada', tone: 'positive' } : { label: 'Sin publicar', tone: 'muted' },
    ],
    previewHref: (p) => `/propiedades/${p.slug || p.id}`,

    toggle: {
      label: (p) => (p.publishedAt ? 'Despublicar' : 'Publicar'),
      body: (p) => ({ publishedAt: p.publishedAt ? null : new Date().toISOString() }),
      successMessage: (p) => (p.publishedAt ? 'Propiedad despublicada' : 'Propiedad publicada'),
      errorMessage: 'No se pudo actualizar el estado de publicación',
    },
  },

  properties: {
    resource: 'properties',
    title: 'Propiedades 2ª mano',
    searchPlaceholder: 'Referencia, dirección, zona…',
    viewStorageKey: 'sa-admin-properties-view',
    card: 'agent',
    cardToggleEvent: 'toggle-sold',
    statusOptions: Object.entries(AGENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    sortOptions: BASE_SORT_OPTIONS,
    hasTransactionFilter: true,

    rowTitle: (p) => p.propertyType || 'Vivienda',
    rowImage: (p) => p.mainImage || null,
    // `location` es el campo de texto libre anterior a la dirección granular
    // (ver la sección Ubicación en PROPERTY_BUILDER_SECTIONS): sigue siendo
    // lo único que tienen las filas antiguas, así que es el último recurso.
    rowLocation: (p) => [p.district, p.city, p.country].filter(Boolean).join(' · ') || p.location || '—',
    rowChips: (p) => {
      const chips: ListChip[] = [{ label: AGENT_STATUS_LABELS[p.status] || p.status, tone: p.status === 'sold' ? 'strong' : 'positive' }]
      if (p.transactionType) chips.push({ label: p.transactionType === 'rent' ? 'Alquiler' : 'Venta', tone: 'neutral' })
      return chips
    },
    previewHref: null,

    toggle: {
      label: (p) => (p.status === 'sold' ? 'Marcar disponible' : 'Marcar vendida'),
      body: (p) => ({ status: p.status === 'sold' ? 'available' : 'sold' }),
      successMessage: (p) => (p.status === 'sold' ? 'Propiedad marcada como disponible' : 'Propiedad marcada como vendida'),
      errorMessage: 'No se pudo actualizar el estado',
    },
  },
}

/** Los tipos de propiedad del selector rápido — idénticos en los dos catálogos, y los mismos que ofrece el editor. */
export const PROPERTY_LIST_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']

export const LIST_CHIP_CLASSES: Record<ListChipTone, string> = {
  neutral: 'bg-stone-100 text-stone-600',
  muted: 'bg-stone-100 text-stone-500',
  positive: 'bg-emerald-100 text-emerald-700',
  strong: 'bg-stone-800 text-white',
}

/**
 * Declarative section layout for the Property Builder
 * (components/property-builder/PropertyBuilder.vue).
 *
 * Adding a section later — for AI content, portals, documentation, etc. — is
 * adding an entry here, not building a new page. Each section's `kind`
 * decides which renderer handles it; a "fields" section is a plain grid of
 * inputs, "gallery"/"child-table" delegate to a manager component backed by
 * the resource's existing generic /api/admin/<child-resource> endpoints
 * (the same ones the old flat form used for floor-plans, project-images,
 * etc.), and "translations" reuses the existing en/ar title+description
 * pattern. No new persistence model — this only reorganizes fields that
 * already exist on real columns/tables.
 *
 * El **listado** de propiedades tiene su gemelo en
 * `composables/usePropertyListConfig.ts` (`PROPERTY_LIST_CONFIG`), con la
 * misma forma y las mismas claves de recurso. Un catálogo nuevo necesita una
 * entrada en los dos.
 */

import { CURRENCIES, currencySymbol, DEFAULT_AGENCY_CURRENCY } from '~/utils/currency'
import { PROPERTY_CONDITIONS, PROPERTY_CONDITION_LABELS, PROPERTY_SHEET_GROUPS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, isRentTransaction, pricePerSquareMeter, type SheetField } from '~/utils/propertySheet'
import { CATALOG_STATUS_TITLES } from '~/utils/propertyCommercialStatus'

export interface FieldSpec {
  key: string
  label: string
  type: 'text' | 'textarea' | 'rich-text' | 'number' | 'stepper' | 'select' | 'checkbox' | 'image' | 'url' | 'json' | 'relation' | 'agent' | 'payment-plan' | 'video' | 'date' | 'computed'
  options?: string[]
  /**
   * Etiqueta legible por valor, para los `select` cuyo valor guardado es una
   * clave interna (`under_construction`, `sale`…). Sin esto el desplegable
   * enseña la clave cruda, que es lo que veía la inmobiliaria: el valor que
   * se guarda no cambia, sólo lo que se lee.
   */
  optionLabels?: Record<string, string>
  /** For type 'relation': the admin resource to fetch options from. */
  relationResource?: string
  hint?: string
  /** Grid column span out of the section's 2-col grid. */
  span?: 1 | 2
  required?: boolean
  /** Not required to save, but counted (with required fields) toward the completion progress — unlike a plain optional field. */
  recommended?: boolean
  /** Visual subheading a 'fields' section groups this field under (e.g. "Identificación", "Equipamiento"). Consecutive fields sharing the same group render together under one heading — see groupFields(). Omit for a field that isn't part of a named group. */
  group?: string
  /**
   * Campo condicional (FASE 25): sólo se enseña si `form[key]` vale uno de
   * `in` — p. ej. la fianza sólo en alquiler. `notIn` es lo contrario. Un
   * valor vacío cuenta como `emptyAs` (por defecto, 'sale' para la operación).
   */
  showWhen?: { key: string; in?: string[]; notIn?: string[]; emptyAs?: string }
  /** Para `computed`: valor derivado de la ficha que se enseña pero nunca se guarda. */
  compute?: (form: Record<string, any>) => string
  /**
   * Rótulo que depende de la ficha (cierre D1p): p. ej. «Renta mensual» en
   * vez de «Precio» cuando la operación es alquiler. `label` sigue siendo el
   * nombre por defecto (búsqueda de campos, validación).
   */
  labelFor?: (form: Record<string, any>) => string
  /**
   * Campo heredado (cierre D1p): sólo se enseña si la ficha ya traía un valor
   * AL ABRIRLA — para no perder ni esconder lo que hay, sin ofrecerlo como una
   * segunda forma de escribir algo que ya tiene su campo. Vaciarlo no lo
   * oculta hasta volver a abrir la ficha.
   */
  legacyOnly?: boolean
  /**
   * Campo que genera el sistema (Cola 11): se rotula «Automático» y esta frase
   * dice cómo se genera. Un campo así nunca se marca si exige intervención
   * manual.
   */
  auto?: string
  /**
   * Sólo con `auto`: el valor automático se puede sobrescribir, como opción
   * avanzada y controlada (en una propiedad ya creada empieza bloqueado y
   * desbloquearlo avisa de que cambiar la dirección pública rompe los enlaces
   * ya publicados).
   */
  autoOverridable?: boolean
  /**
   * Campo de la interfaz que no es una columna de la propiedad (el motivo de
   * un cambio de precio, un valor calculado): el filtrado por schema
   * (PropertySchemaRegistry) no lo oculta.
   */
  virtual?: boolean
}

interface BaseSection {
  key: string
  label: string
  icon: string
  /** Short one-line explanation shown under the section title, e.g. "Completa los datos principales de la propiedad." */
  description: string
}

/** Un bloque que se pinta DESPUÉS de los campos de una sección de campos (traducciones, tipologías…). */
export type SectionExtra =
  | { kind: 'translations' }
  | { kind: 'child-table'; title: string; description?: string; childResource: string; parentField: string; columns: FieldSpec[] }

export interface FieldsSection extends BaseSection {
  kind: 'fields'
  fields: FieldSpec[]
  /** Grupos (rótulo de `group`) que arrancan plegados: Referencias y SEO en Información básica. */
  collapsedGroups?: string[]
  extras?: SectionExtra[]
}

export interface LocationSection extends BaseSection {
  kind: 'location'
  /** Address text fields, rendered in the same grid as a 'fields' section. */
  fields: FieldSpec[]
  latField: string
  lngField: string
}

export interface GallerySection extends BaseSection {
  kind: 'gallery'
  childResource: string
  parentField: string
  /** Which form field "Usar como portada" writes to — defaults to 'coverImage' (developer-properties' column); properties uses 'mainImage' instead. */
  coverField?: string
}

export interface ChildTableSection extends BaseSection {
  kind: 'child-table'
  childResource: string
  parentField: string
  columns: FieldSpec[]
  /** Columna de orden: las tarjetas salen por ella y se mueven con ← → (planos, #110). */
  orderField?: string
  /** Columna 0/1 «visible en la web»: la tarjeta lo dice y se ve atenuada si está oculta. */
  visibleField?: string
}

export interface SocialSection extends BaseSection {
  kind: 'social'
  childResource: string
  parentField: string
}

export interface TranslationsSection extends BaseSection {
  kind: 'translations'
}

export interface RoomsSection extends BaseSection {
  kind: 'rooms'
  childResource: string
  parentField: string
}

/** Propietarios, copropietarios, apoderados, inquilinos y contactos de la propiedad (PropertyContact, FASE 8). */
export interface OwnersSection extends BaseSection {
  kind: 'owners'
}

/**
 * Compradores compatibles (FASE 11, núcleo N4): la dirección Inmueble →
 * compradores del motor de matching dentro de la propia ficha, con las
 * acciones sobre cada compatibilidad. Sólo lectura de la ficha: no tiene
 * campos que guardar.
 */
export interface BuyerMatchesSection extends BaseSection {
  kind: 'buyer-matches'
}

/**
 * Paneles propios de la ficha (bloque N7a): «Documentos» (FASE 6, gestor
 * documental con permisos) y «Portales» (FASE 25, en qué canales está
 * publicada). No tienen campos de la fila: se gestionan solos.
 */
export interface PanelSection extends BaseSection {
  kind: 'panel'
  panel: 'documents' | 'portals'
}

/**
 * «Multimedia y planos» (Cola 11): un solo apartado con Portada, Galería (por
 * estancias), Vídeos, Planos y Vistas 360° / tours. Reutiliza los gestores de
 * siempre; no hay un segundo modelo de multimedia.
 */
export interface MediaSection extends BaseSection {
  kind: 'media'
  /** Columna de la portada: `coverImage` (obra nueva) o `mainImage` (2ª mano). */
  coverField: string
  gallery: { childResource: string; parentField: string }
  floorPlans: { childResource: string; parentField: string; orderField: string; visibleField: string; columns: FieldSpec[] }
  videoField: FieldSpec
  tourFields: FieldSpec[]
  /** Imágenes de identidad y de proyecto que sólo tiene la obra nueva (logo, master plan, mapa). */
  projectImages: FieldSpec[]
  /** Textos que acompañan a los planos y al mapa (sólo obra nueva). */
  planTexts: FieldSpec[]
}

export type BuilderSection = MediaSection | FieldsSection | LocationSection | GallerySection | ChildTableSection | SocialSection | TranslationsSection | RoomsSection | OwnersSection | BuyerMatchesSection | PanelSection

/**
 * Splits a section's fields into visual subsections by their `group` label,
 * preserving field order — a run of consecutive fields sharing the same
 * `group` becomes one subsection with a heading; a field with no `group`
 * renders on its own with no heading. Fields aren't reordered or
 * deduplicated by group name, so declare a group's fields together in the
 * section's array.
 */
export function groupFields(fields: FieldSpec[]): { label: string | null; fields: FieldSpec[] }[] {
  const groups: { label: string | null; fields: FieldSpec[] }[] = []
  for (const f of fields) {
    const label = f.group ?? null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.fields.push(f)
    else groups.push({ label, fields: [f] })
  }
  return groups
}

/**
 * Tipos de inmueble: la misma lista en los dos catálogos (utils/propertySheet.ts),
 * con su etiqueta en español. En 2ª mano el tipo decide además el schema
 * (PropertySchemaRegistry, FASE 26) y con él qué campos aplican; en obra
 * nueva el schema es siempre newDevelopment.
 */
const PROPERTY_TYPE_OPTIONS = [...PROPERTY_TYPES] as string[]
const ORIENTATION_OPTIONS = ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW']
const ENERGY_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
// Estado físico: catálogo común (utils/propertySheet.ts), el mismo que lee el motor de matching.
const CONDITION_OPTIONS = [...PROPERTY_CONDITIONS] as string[]
const CONDITION_LABELS = PROPERTY_CONDITION_LABELS
const FURNISHED_OPTIONS = ['yes', 'no', 'partially']
const FURNISHED_LABELS: Record<string, string> = { yes: 'Sí', no: 'No', partially: 'Parcialmente' }
const LOCATION_PRIVACY_OPTIONS = ['exact', 'approximate', 'hidden_number']
const LOCATION_PRIVACY_LABELS: Record<string, string> = { exact: 'Exacta', approximate: 'Aproximada', hidden_number: 'Ocultar número' }

/** Un campo de la ficha ampliada (utils/propertySheet.ts) como campo del editor. */
function sheetSpec(f: SheetField, group: string): FieldSpec {
  const type: FieldSpec['type'] =
    f.type === 'bool' ? 'checkbox' : f.type === 'integer' ? 'number' : f.type === 'relation' ? 'relation' : (f.type as FieldSpec['type'])
  return {
    key: f.key,
    label: f.label,
    type,
    group,
    hint: f.hint,
    ...(f.options ? { options: f.options, optionLabels: f.optionLabels } : {}),
    ...(f.relationResource ? { relationResource: f.relationResource } : {}),
    ...(f.type === 'textarea' ? { span: 2 as const } : {}),
  }
}

/** Los campos de un bloque de la ficha ampliada, con el rótulo de grupo que se quiera en el editor. */
function sheetGroup(key: string, group?: string, extra: Partial<FieldSpec> = {}): FieldSpec[] {
  const g = PROPERTY_SHEET_GROUPS.find((x) => x.key === key)
  if (!g) throw new Error(`Bloque de ficha desconocido: ${key}`)
  return g.fields.map((f) => ({ ...sheetSpec(f, group ?? g.label), ...extra }))
}

/** Los campos de un bloque sin rótulo de grupo (para mezclarlos con los de una sección sin grupos, como Ubicación). */
function sheetGroupFlat(key: string): FieldSpec[] {
  return sheetGroup(key).map(({ group: _group, ...f }) => f)
}

const ONLY_RENT = { key: 'transactionType', in: ['rent'], emptyAs: 'sale' }
const ONLY_SALE = { key: 'transactionType', notIn: ['rent'], emptyAs: 'sale' }

/**
 * Símbolo de la moneda de la agencia (cierre D3b) para el precio por m². Se
 * lee al pintar el campo; fuera de una app de Nuxt (tests del catálogo de
 * campos) se usa el de la moneda por defecto.
 */
function agencySymbol(): string {
  try {
    return useAgencyCurrency().symbol.value
  } catch {
    return currencySymbol(DEFAULT_AGENCY_CURRENCY)
  }
}

/** Precio por m² (o renta por m² y mes en alquiler) calculado: precio ÷ superficie construida. Nunca se guarda. */
const PRICE_PER_M2: FieldSpec = {
  key: 'pricePerSquareMeter',
  label: 'Precio por m²',
  labelFor: (form) => (isRentTransaction(form.transactionType) ? `Renta por m² (${agencySymbol()}/m²·mes)` : `Precio por m² (${agencySymbol()}/m²)`),
  type: 'computed',
  virtual: true,
  auto: 'Calculado: precio ÷ superficie construida (en alquiler, renta mensual ÷ superficie). Nunca se guarda.',
  hint: 'Calculado: precio ÷ superficie construida (en alquiler, renta mensual ÷ superficie).',
  group: 'Precio principal',
  compute: (form) => {
    const v = pricePerSquareMeter(form.price, form.area)
    if (v == null) return 'Indica precio y superficie construida'
    return `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${agencySymbol()}${isRentTransaction(form.transactionType) ? '/m²·mes' : '/m²'}`
  },
}

/**
 * Con operación «Alquiler» el único precio de la propiedad es la renta de
 * cada mes (cierre D1p, sin columna aparte): el rótulo lo dice.
 */
function priceLabel(saleLabel: string) {
  return (form: Record<string, any>) => (isRentTransaction(form.transactionType) ? 'Renta mensual' : saleLabel)
}

/** Fechas de gestión (cierre D1p): selector de fecha; el servidor exige AAAA-MM-DD al cambiarlas. */
const DATE_HINT_LEGACY = 'Si la ficha la tenía escrita a mano (p. ej. 15/03/2025), se sigue entendiendo; elige la fecha para guardarla en el formato nuevo.'

/**
 * El estado comercial común (ficha ampliada) frente al `status` de cada
 * catálogo — tres datos distintos, ver utils/propertyCommercialStatus.ts.
 */
const COMMERCIAL_STATUS_HINT = 'El que gestiona la agencia, igual en los dos catálogos: se filtra y se cambia desde el listado. «Reservada» marca además la etiqueta «Reservada» de la web.'
const COMMERCIAL_STATUS_HINT_AGENT = `${COMMERCIAL_STATUS_HINT} «Vendida» y «Disponible» ponen igual la disponibilidad.`

/**
 * «Gastos de comunidad anuales» (`service_charge_annual`, de la fila) es el
 * dato anterior a la ficha ampliada, que ya tiene «Comunidad (mensual)». Se
 * conserva tal cual (nada se borra ni se convierte), pero sólo aparece en las
 * fichas que lo tenían relleno, con su explicación (cierre D1p).
 */
const LEGACY_SERVICE_CHARGE: FieldSpec = {
  key: 'serviceChargeAnnual',
  label: 'Gastos de comunidad anuales (dato anterior)',
  type: 'number',
  legacyOnly: true,
  group: 'Inversión',
  hint: 'Dato que se guardaba antes de la ficha ampliada. La comunidad se indica ahora en Precio → «Comunidad (mensual)»; cuando la tengas allí, puedes vaciar este campo y dejará de aparecer.',
}

/** La casilla «Reservada» de la web, heredada: ahora la marca el estado comercial «Reservada» (cierre D1p). */
const LEGACY_RESERVED: FieldSpec = {
  key: 'isReserved',
  label: 'Reservada (marca anterior)',
  type: 'checkbox',
  legacyOnly: true,
  group: 'Inversión',
  hint: 'Es la etiqueta «Reservada» que enseña la web. Ahora se marca y se quita sola con el «Estado comercial» (Información básica).',
}

/** Motivo del cambio de precio: se guarda en el histórico sólo si el precio cambia. */
const PRICE_CHANGE_REASON: FieldSpec = {
  key: 'priceChangeReason',
  label: 'Motivo del cambio de precio',
  type: 'text',
  virtual: true,
  span: 2,
  hint: 'Opcional. Si cambias el precio, queda en el histórico junto a quién lo cambió.',
  group: 'Precio principal',
}

/** Bloques de la ficha ampliada que comparten los dos catálogos, en el orden del editor. */
const SHEET_PRICE_FIELDS: FieldSpec[] = [
  ...sheetGroup('sale', 'Venta', { showWhen: ONLY_SALE }),
  ...sheetGroup('rent', 'Alquiler', { showWhen: ONLY_RENT }),
  ...sheetGroup('costs', 'Gastos del inmueble').map((f) =>
    f.key === 'communityFeeMonthly' ? { ...f, hint: 'La cuota de comunidad, al mes. Es el único sitio donde se escribe: el antiguo «Gastos de comunidad anuales» sólo aparece (en Comercial / Inversión) en las fichas que lo tenían.' } : f,
  ),
  ...sheetGroup('commissions', 'Comisiones'),
]

/** El estado comercial común, con la explicación de en qué se diferencia del `status` del catálogo. */
function commercialStatusField(group: string, kind: 'developer' | 'agent'): FieldSpec[] {
  return sheetGroup('identification', group)
    .filter((f) => f.key === 'commercialStatus')
    .map((f) => ({ ...f, hint: kind === 'agent' ? COMMERCIAL_STATUS_HINT_AGENT : COMMERCIAL_STATUS_HINT }))
}
const OWNERS_SECTION: OwnersSection = {
  key: 'owners',
  label: 'Propietarios',
  icon: 'badge',
  description: 'Propietarios (con su % de propiedad), apoderados, inquilinos y contactos de la propiedad.',
  kind: 'owners',
}

const BUYER_MATCHES_SECTION: BuyerMatchesSection = {
  key: 'buyer-matches',
  label: 'Compradores compatibles',
  icon: 'chart',
  description: 'Qué necesidades registradas encajan con este inmueble, por qué, y las acciones con cada comprador.',
  kind: 'buyer-matches',
}

const DOCUMENTS_SECTION: PanelSection = {
  key: 'documents',
  label: 'Documentos',
  icon: 'doc',
  description: 'Escrituras, nota simple, IBI, certificados, planos y contratos, con quién puede verlos y su caducidad.',
  kind: 'panel',
  panel: 'documents',
}

const PORTALS_SECTION: PanelSection = {
  key: 'portals',
  label: 'Portales',
  icon: 'sparkles',
  description: 'En qué canales está publicada la propiedad y el estado de cada uno.',
  kind: 'panel',
  panel: 'portals',
}

const SHEET_LEGAL_SECTION: FieldsSection = {
  key: 'legal',
  label: 'Legal y certificados',
  icon: 'doc',
  description: 'Situación registral, cargas, licencias y certificado energético. Todo interno salvo la calificación energética.',
  kind: 'fields',
  fields: [...sheetGroup('legal'), ...sheetGroup('energy')],
}


export type BuilderCatalog = 'developer' | 'agent'

/** El estado general del inmueble (columna `condition`), con sus seis opciones en este orden. */
const CONDITION_FIELD: FieldSpec = {
  key: 'condition',
  label: 'Estado',
  type: 'select',
  options: CONDITION_OPTIONS,
  optionLabels: CONDITION_LABELS,
  group: 'Clasificación',
  hint: 'El estado general del inmueble. Es el antiguo «Estado físico» (mismo dato). La fase de la obra de una promoción está en Características.',
}

/** «Fase de la obra» (obra nueva): lo que antes se llamaba «Estado de la obra». Se conserva como dato, en Características. */
const CONSTRUCTION_PHASE_FIELD: FieldSpec = {
  key: 'status',
  label: 'Fase de la obra',
  type: 'select',
  options: ['new', 'under_construction', 'ready'],
  optionLabels: { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista' },
  hint: 'La fase de la construcción. Si se puede vender o no lo dice el «Estado comercial».',
  group: 'Edificio y vivienda',
}

/** Un campo de la ficha ampliada que ya tiene un sitio mejor: se conserva si la ficha lo traía relleno. */
function legacyFrom(fields: FieldSpec[], key: string, hint: string): FieldSpec[] {
  return fields.map((f) => (f.key === key ? { ...f, legacyOnly: true, hint } : f))
}

const LOCATION_FIELDS_COMMON: FieldSpec[] = [
  { key: 'country', label: 'País', type: 'text', recommended: true },
  { key: 'city', label: 'Localidad', type: 'text', recommended: true },
  { key: 'street', label: 'Calle', type: 'text' },
  { key: 'streetNumber', label: 'Número', type: 'text' },
  { key: 'community', label: 'Urbanización', type: 'text' },
  { key: 'block', label: 'Bloque', type: 'text' },
  { key: 'portal', label: 'Portal', type: 'text' },
  { key: 'floor', label: 'Piso', type: 'text' },
  { key: 'doorLetter', label: 'Letra', type: 'text' },
  { key: 'postalCode', label: 'Código postal', type: 'text' },
  { key: 'district', label: 'Distrito', type: 'text' },
]

const PRIVACY_FIELDS: FieldSpec[] = [
  {
    key: 'locationPrivacy',
    label: 'Privacidad de la ubicación',
    type: 'select',
    options: LOCATION_PRIVACY_OPTIONS,
    optionLabels: LOCATION_PRIVACY_LABELS,
    hint: 'Exacta: se publica tal cual. Aproximada: coordenadas redondeadas y sin número. Ocultar número: coordenadas exactas pero sin número/portal/bloque/planta/letra en público.',
    span: 2,
  },
  { key: 'locationPrivacyRadius', label: 'Radio de privacidad (m)', type: 'number', hint: 'Con «Ubicación aproximada», el punto público se redondea a una cuadrícula de este tamaño (mínimo unos 110 m): cuanto mayor, menos precisa la ubicación que se publica.' },
]

const PLAN_COLUMNS: FieldSpec[] = [
  { key: 'title', label: 'Título', type: 'text', hint: 'Lo que se lee en la web: «Planta baja», «Primera planta», «Ático»…' },
  { key: 'image', label: 'Imagen del plano', type: 'image' },
  { key: 'isPublic', label: 'Visible en la web', type: 'checkbox' },
  { key: 'category', label: 'Categoría', type: 'text' },
  { key: 'unitType', label: 'Tipo de unidad', type: 'text' },
  { key: 'floorDetails', label: 'Detalles', type: 'text' },
  { key: 'sizes', label: 'Tamaños', type: 'text' },
  { key: 'type', label: 'Tipo', type: 'text' },
]

/**
 * **El** constructor de propiedades: los mismos 13 apartados, los mismos
 * campos y las mismas validaciones para Propiedades (web) y Propiedades 2ª
 * mano. Lo único que cambia entre las dos son las capacidades que sólo tiene
 * un catálogo (promotora, plan de pagos, imágenes de proyecto, tipologías,
 * traducciones…) y los recursos hijos a los que apunta cada gestor.
 *
 * Los pasos que desaparecen (Descripción, Edificio y vivienda, Galería,
 * Planos, Tipos de unidad, Redes sociales) no pierden datos: sus campos están
 * ahora dentro de los apartados que los absorben, o siguen guardados sin
 * pantalla (redes sociales, fotografía «premium»).
 */
export function buildPropertySections(catalog: BuilderCatalog): BuilderSection[] {
  const dev = catalog === 'developer'

  const info: FieldsSection = {
    key: 'info',
    label: 'Información básica',
    icon: 'doc',
    description: 'Título, descripción y datos principales de la propiedad.',
    kind: 'fields',
    collapsedGroups: ['Referencias', 'SEO'],
    fields: [
      { key: 'name', label: 'Título', type: 'text', span: 2, required: dev, recommended: !dev, group: 'Título y descripción' },
      { key: 'description', label: 'Descripción', type: 'rich-text', span: 2, recommended: true, group: 'Título y descripción' },
      { key: 'keyHighlights', label: 'Puntos clave', type: 'textarea', span: 2, group: 'Título y descripción' },
      ...(dev ? [{ key: 'developerId', label: 'Promotora', type: 'relation', relationResource: 'developers', required: true, group: 'Clasificación' } as FieldSpec] : []),
      CONDITION_FIELD,
      { key: 'transactionType', label: 'Operación', type: 'select', options: ['sale', 'rent'], optionLabels: { sale: 'Venta', rent: 'Alquiler' }, recommended: true, group: 'Clasificación' },
      { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS, optionLabels: PROPERTY_TYPE_LABELS, recommended: true, group: 'Clasificación' },
      ...sheetGroup('identification', 'Clasificación').filter((f) => f.key === 'subtype'),
      ...(dev
        ? []
        : [
            {
              key: 'status',
              label: CATALOG_STATUS_TITLES.agent,
              type: 'select',
              options: ['available', 'sold'],
              optionLabels: { available: 'Disponible', sold: 'Vendida' },
              hint: 'La que lee el matching. «Vendida» pasa también a «Vendida» un estado comercial ya indicado.',
              group: 'Clasificación',
            } as FieldSpec,
          ]),
      ...commercialStatusField('Clasificación', catalog),
      { key: 'yearBuilt', label: 'Año de construcción', type: 'number', group: 'Clasificación' },
      ...sheetGroup('identification', 'Clasificación').filter((f) => f.key === 'commercialCode'),
      { key: 'reference', label: 'Referencia interna', type: 'text', auto: 'Se genera sola la primera vez que se guarda y no se vuelve a generar: guardar de nuevo no la cambia.', hint: 'Déjala vacía para que se genere.', group: 'Referencias' },
      { key: 'agencyReference', label: 'Referencia de agencia', type: 'text', group: 'Referencias' },
      { key: 'externalSource', label: 'Origen externo', type: 'text', hint: 'De dónde procede si viene de un sistema externo.', group: 'Referencias' },
      { key: 'externalReference', label: 'Referencia externa', type: 'text', group: 'Referencias' },
      {
        key: 'slug',
        label: 'Slug',
        type: 'text',
        span: 2,
        auto: 'Se genera a partir del título al crear la propiedad y no cambia aunque cambies el título: la dirección pública no se rompe.',
        autoOverridable: true,
        hint: 'La parte final de la dirección pública de la ficha. Es opcional escribirlo a mano.',
        group: 'SEO',
      },
    ],
    // Las traducciones sólo existen en 2ª mano (property_translations).
    ...(dev ? {} : { extras: [{ kind: 'translations' }] as SectionExtra[] }),
  }

  const location: LocationSection = {
    key: 'location',
    label: 'Ubicación',
    icon: 'building',
    description: 'Dirección completa y ubicación en el mapa.',
    kind: 'location',
    latField: 'lat',
    lngField: 'lng',
    fields: [
      ...LOCATION_FIELDS_COMMON,
      ...sheetGroupFlat('location'),
      ...(dev ? [] : [{ key: 'location', label: 'Referencia de ubicación (heredado)', type: 'text', span: 2, legacyOnly: true, hint: 'Campo de texto libre anterior. Se conserva por compatibilidad; usa los campos de arriba para direcciones nuevas.' } as FieldSpec]),
      ...PRIVACY_FIELDS,
    ],
  }

  const price: FieldsSection = {
    key: 'price',
    label: 'Precio',
    icon: 'invoice',
    description: dev ? 'Moneda, precio, evolución y plan de pagos.' : 'Moneda y precio de venta o alquiler.',
    kind: 'fields',
    fields: [
      {
        key: 'currency',
        label: 'Tipo de moneda',
        type: 'select',
        options: CURRENCIES.map((c) => c.code),
        optionLabels: Object.fromEntries(CURRENCIES.map((c) => [c.code, `${c.code} — ${c.label}`])),
        hint: 'La moneda en la que está expresado el precio. Vacío: la moneda de la inmobiliaria. No se convierte ningún importe al guardar.',
        group: 'Precio principal',
      },
      { key: 'price', label: 'Precio', labelFor: priceLabel('Precio'), type: 'number', required: true, group: 'Precio principal' },
      { key: 'priceOld', label: 'Precio anterior', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.', group: 'Precio principal' },
      PRICE_PER_M2,
      PRICE_CHANGE_REASON,
      ...(dev
        ? [
            { key: 'handoverDate', label: 'Fecha de entrega', type: 'text', group: 'Condiciones' } as FieldSpec,
            { key: 'handoverPercentage', label: '% a la entrega', type: 'text', group: 'Condiciones' } as FieldSpec,
            { key: 'downPercentage', label: '% de entrada', type: 'text', group: 'Condiciones' } as FieldSpec,
            { key: 'constructionPercentage', label: '% durante construcción', type: 'text', group: 'Condiciones' } as FieldSpec,
          ]
        : []),
      ...SHEET_PRICE_FIELDS,
      { key: 'paymentPlan', label: 'Plan de pagos', type: 'payment-plan', span: 2, group: 'Plan de pagos' },
    ],
  }

  const features: FieldsSection = {
    key: 'features',
    label: 'Características',
    icon: 'layers',
    description: 'Superficies y distribución, edificio y vivienda, equipamiento y características adicionales.',
    kind: 'fields',
    fields: [
      { key: 'bedrooms', label: 'Dormitorios', type: 'stepper', recommended: true, group: 'Superficies y distribución' },
      { key: 'bathrooms', label: 'Baños', type: 'stepper', recommended: true, group: 'Superficies y distribución' },
      { key: 'toilets', label: 'Aseos', type: 'stepper', group: 'Superficies y distribución' },
      { key: 'livingRooms', label: 'Salones', type: 'stepper', group: 'Superficies y distribución' },
      { key: 'kitchens', label: 'Cocinas', type: 'stepper', group: 'Superficies y distribución' },
      { key: 'garageSpaces', label: 'Plazas de garaje', type: 'stepper', group: 'Superficies y distribución' },
      { key: 'area', label: 'Superficie construida (m²)', type: 'number', recommended: true, group: 'Superficies y distribución' },
      { key: 'usableArea', label: 'Superficie útil (m²)', type: 'number', group: 'Superficies y distribución' },
      { key: 'plotArea', label: 'Superficie de parcela (m²)', type: 'number', group: 'Superficies y distribución' },
      { key: 'terraceArea', label: 'Superficie de terraza (m²)', type: 'number', group: 'Superficies y distribución' },
      { key: 'gardenArea', label: 'Superficie de jardín (m²)', type: 'number', group: 'Superficies y distribución' },
      { key: 'balconyArea', label: 'Superficie de balcón (m²)', type: 'number', group: 'Superficies y distribución' },
      { key: 'storageArea', label: 'Superficie de trastero (m²)', type: 'number', group: 'Superficies y distribución' },
      ...sheetGroup('surfaces', 'Superficies y distribución'),
      ...sheetGroup('distribution', 'Superficies y distribución'),
      ...(dev ? [CONSTRUCTION_PHASE_FIELD] : []),
      ...sheetGroup('building', 'Edificio y vivienda'),
      ...legacyFrom(sheetGroup('dwelling', 'Edificio y vivienda'), 'isRenovated', 'Dato anterior. Ahora el inmueble reformado se indica en Información básica → Estado → «Reformado»; si la ficha lo tenía marcado, se conserva aquí.'),
      { key: 'furnished', label: 'Amueblado', type: 'select', options: FURNISHED_OPTIONS, optionLabels: FURNISHED_LABELS, group: 'Equipamiento y dimensiones' },
      { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS, group: 'Equipamiento y dimensiones' },
      { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS, group: 'Equipamiento y dimensiones' },
      { key: 'hasElevator', label: 'Ascensor', type: 'checkbox', group: 'Equipamiento y dimensiones' },
      { key: 'hasPool', label: 'Piscina', type: 'checkbox', group: 'Equipamiento y dimensiones' },
      { key: 'hasGarage', label: 'Garaje', type: 'checkbox', group: 'Equipamiento y dimensiones' },
      { key: 'hasTerrace', label: 'Terraza', type: 'checkbox', group: 'Equipamiento y dimensiones' },
      { key: 'hasGarden', label: 'Jardín', type: 'checkbox', group: 'Equipamiento y dimensiones' },
      { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox', group: 'Características adicionales' },
      { key: 'accessible', label: 'Accesible', type: 'checkbox', group: 'Características adicionales' },
      {
        key: 'featuresReviewedAt',
        label: 'Características repasadas',
        type: 'checkbox',
        hint: 'Márcalo tras revisar el equipamiento de arriba — así un "No" marcado se distingue de "todavía sin repasar" (usado por el motor de compatibilidad).',
        group: 'Características adicionales',
      },
    ],
    // Las tipologías de una promoción se gestionan dentro de Características (ya no es un paso aparte).
    ...(dev
      ? {
          extras: [
            {
              kind: 'child-table',
              title: 'Tipologías de la promoción',
              description: 'Tipologías disponibles y sus tamaños: salen en la sección «Tipologías» de la ficha pública.',
              childResource: 'property-types',
              parentField: 'developerPropertyId',
              columns: [
                { key: 'propertyType', label: 'Tipo', type: 'text', required: true },
                { key: 'unitType', label: 'Unidad', type: 'text', required: true },
                { key: 'size', label: 'Tamaño', type: 'text', required: true },
              ],
            },
          ] as SectionExtra[],
        }
      : {}),
  }

  const rooms: RoomsSection = {
    key: 'rooms',
    label: 'Estancias personalizadas',
    icon: 'layers',
    description: 'Dormitorios, despachos u otras estancias con su propia superficie y orientación.',
    kind: 'rooms',
    childResource: dev ? 'developer-property-rooms' : 'agent-property-rooms',
    parentField: dev ? 'developerPropertyId' : 'propertyId',
  }

  const installations: FieldsSection = {
    key: 'installations',
    label: 'Instalaciones y exteriores',
    icon: 'sparkles',
    description: 'Instalaciones, zonas comunes y exteriores: primero los desplegables y después las casillas.',
    kind: 'fields',
    fields: [...sheetGroup('installations'), ...sheetGroup('common'), ...sheetGroup('exterior')],
  }

  const media: MediaSection = {
    key: 'media',
    label: 'Multimedia y planos',
    icon: 'widget',
    description: 'Portada, galería por estancias, vídeos, planos y tours virtuales.',
    kind: 'media',
    coverField: dev ? 'coverImage' : 'mainImage',
    gallery: dev ? { childResource: 'project-images', parentField: 'developerPropertyId' } : { childResource: 'gallery-images', parentField: 'propertyId' },
    floorPlans: {
      childResource: dev ? 'floor-plans' : 'agent-property-floor-plans',
      parentField: dev ? 'developerPropertyId' : 'propertyId',
      orderField: 'sortOrder',
      visibleField: 'isPublic',
      columns: PLAN_COLUMNS,
    },
    videoField: { key: 'videoUrl', label: 'Vídeo', type: 'video', span: 2 },
    tourFields: sheetGroup('media', 'Vistas 360° y tours virtuales').map((f) => ({ ...f, span: 2 as const })),
    // «Identidad del proyecto» (logo, imagen del master plan y mapa de ubicación) ya no se edita aquí: los ficheros que ya tuvieran las fichas siguen guardados.
    projectImages: [],
    planTexts: dev
      ? [
          { key: 'masterPlanDescription', label: 'Descripción del master plan', type: 'rich-text', span: 2, group: 'Textos de los planos' },
          { key: 'floorPlanDescription', label: 'Descripción de los planos', type: 'rich-text', span: 2, group: 'Textos de los planos' },
          { key: 'locationMapDescription', label: 'Descripción del mapa de ubicación', type: 'rich-text', span: 2, group: 'Textos de los planos' },
        ]
      : [],
  }

  const commercial: FieldsSection = {
    key: 'commercial',
    label: 'Comercial / Inversión',
    icon: 'chart',
    description: 'Comercial asignado, captación, condiciones y datos de inversión.',
    kind: 'fields',
    fields: [
      { key: 'agentId', label: 'Comercial asignado', type: 'agent', span: 2, group: 'Comercial' },
      ...sheetGroup('identification', 'Comercial').filter((f) => f.key === 'officeId' || f.key === 'teamId'),
      { key: 'mandateType', label: 'Tipo de mandato', type: 'text', group: 'Comercial' },
      { key: 'exclusiveFrom', label: 'Exclusividad — inicio', type: 'date', hint: DATE_HINT_LEGACY, group: 'Comercial' },
      { key: 'exclusiveUntil', label: 'Exclusividad — vencimiento', type: 'date', hint: 'El resumen avisa cuando falten 30 días o menos y cuando haya vencido; el listado filtra por ello.', group: 'Comercial' },
      { key: 'captureDate', label: 'Fecha de captación', type: 'date', hint: DATE_HINT_LEGACY, group: 'Captación' },
      { key: 'captureSource', label: 'Origen de captación', type: 'text', group: 'Captación' },
      { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox', group: 'Inversión' },
      LEGACY_RESERVED,
      { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox', group: 'Inversión' },
      { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number', group: 'Inversión' },
      LEGACY_SERVICE_CHARGE,
    ],
  }

  return [info, location, price, features, rooms, installations, media, commercial, OWNERS_SECTION, SHEET_LEGAL_SECTION, DOCUMENTS_SECTION, PORTALS_SECTION, BUYER_MATCHES_SECTION]
}

/** Por recurso: Propiedades (web) y Propiedades 2ª mano, con la misma estructura (`buildPropertySections`). */
export const PROPERTY_BUILDER_SECTIONS: Record<string, BuilderSection[]> = {
  'developer-properties': buildPropertySections('developer'),
  properties: buildPropertySections('agent'),
}

/**
 * Todos los campos de una sección que se guardan con la propiedad, estén donde
 * estén dentro de ella (campos, ubicación, portada/vídeo/tours de «Multimedia y
 * planos»). Lo usan la comprobación de completitud de la demo y las pruebas.
 */
export function sectionFieldSpecs(s: BuilderSection): FieldSpec[] {
  if (s.kind === 'media') {
    const m = s as MediaSection
    return [{ key: m.coverField, label: 'Imagen de portada', type: 'image' }, ...m.projectImages, m.videoField, ...m.tourFields, ...m.planTexts]
  }
  if (s.kind === 'fields' || s.kind === 'location') return (s as FieldsSection).fields
  return []
}

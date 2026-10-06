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

import { currencySymbol, DEFAULT_AGENCY_CURRENCY } from '~/utils/currency'
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

export interface FieldsSection extends BaseSection {
  kind: 'fields'
  fields: FieldSpec[]
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

export type BuilderSection = FieldsSection | LocationSection | GallerySection | ChildTableSection | SocialSection | TranslationsSection | RoomsSection | OwnersSection | BuyerMatchesSection | PanelSection

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
const SHEET_BUILDING_SECTION: FieldsSection = {
  key: 'building',
  label: 'Edificio y vivienda',
  icon: 'building',
  description: 'Datos del edificio y calidades de la vivienda.',
  kind: 'fields',
  fields: [...sheetGroup('building'), ...sheetGroup('dwelling')],
}
const SHEET_INSTALLATIONS_SECTION: FieldsSection = {
  key: 'installations',
  label: 'Instalaciones y exteriores',
  icon: 'sparkles',
  description: 'Instalaciones, zonas comunes y exteriores.',
  kind: 'fields',
  fields: [...sheetGroup('installations'), ...sheetGroup('common'), ...sheetGroup('exterior')],
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

export const PROPERTY_BUILDER_SECTIONS: Record<string, BuilderSection[]> = {
  'developer-properties': [
    {
      key: 'info',
      label: 'Información básica',
      icon: 'doc',
      description: 'Completa los datos principales de la propiedad.',
      kind: 'fields',
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, span: 2, group: 'Identificación' },
        { key: 'slug', label: 'Slug', type: 'text', hint: 'Se genera solo si lo dejas vacío.', group: 'Identificación' },
        { key: 'reference', label: 'Referencia interna', type: 'text', hint: 'Se genera sola si la dejas vacía.', group: 'Identificación' },
        { key: 'agencyReference', label: 'Referencia de agencia', type: 'text', group: 'Identificación' },
        { key: 'externalSource', label: 'Origen externo', type: 'text', hint: 'De dónde procede si viene de un sistema externo.', group: 'Identificación' },
        { key: 'externalReference', label: 'Referencia externa', type: 'text', group: 'Identificación' },
        { key: 'developerId', label: 'Promotora', type: 'relation', relationResource: 'developers', required: true, group: 'Clasificación' },
        {
          key: 'status',
          label: CATALOG_STATUS_TITLES.developer,
          type: 'select',
          options: ['new', 'under_construction', 'ready'],
          optionLabels: { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista' },
          hint: 'La fase de la construcción. Si se puede vender o no lo dice el «Estado comercial».',
          group: 'Clasificación',
        },
        { key: 'transactionType', label: 'Operación', type: 'select', options: ['sale', 'rent'], optionLabels: { sale: 'Venta', rent: 'Alquiler' }, group: 'Clasificación' },
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS, optionLabels: PROPERTY_TYPE_LABELS, group: 'Clasificación' },
        ...sheetGroup('identification', 'Clasificación').filter((f) => f.key === 'subtype'),
        ...commercialStatusField('Clasificación', 'developer'),
        { key: 'yearBuilt', label: 'Año de construcción', type: 'number', group: 'Clasificación' },
        ...sheetGroup('identification', 'Identificación comercial').filter((f) => f.key === 'commercialCode'),
        { key: 'captureDate', label: 'Fecha de captación', type: 'date', hint: DATE_HINT_LEGACY, group: 'Captación' },
        { key: 'captureSource', label: 'Origen de captación', type: 'text', group: 'Captación' },
      ],
    },
    {
      key: 'location',
      label: 'Ubicación',
      icon: 'building',
      description: 'Dirección completa y ubicación en el mapa.',
      kind: 'location',
      latField: 'lat',
      lngField: 'lng',
      fields: [
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
        ...sheetGroupFlat('location'),
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
      ],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      description: 'Precio de salida, evolución y plan de pagos.',
      kind: 'fields',
      fields: [
        { key: 'price', label: 'Precio de salida', labelFor: priceLabel('Precio de salida'), type: 'number', required: true, group: 'Precio principal' },
        { key: 'priceOld', label: 'Precio anterior', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.', group: 'Precio principal' },
        PRICE_PER_M2,
        PRICE_CHANGE_REASON,
        { key: 'handoverDate', label: 'Fecha de entrega', type: 'text', group: 'Condiciones' },
        { key: 'handoverPercentage', label: '% a la entrega', type: 'text', group: 'Condiciones' },
        { key: 'downPercentage', label: '% de entrada', type: 'text', group: 'Condiciones' },
        { key: 'constructionPercentage', label: '% durante construcción', type: 'text', group: 'Condiciones' },
        ...SHEET_PRICE_FIELDS,
        { key: 'paymentPlan', label: 'Plan de pagos', type: 'payment-plan', span: 2, group: 'Plan de pagos' },
      ],
    },
    {
      key: 'features',
      label: 'Características',
      icon: 'layers',
      description: 'Distribución, superficie y equipamiento.',
      kind: 'fields',
      fields: [
        { key: 'bedrooms', label: 'Dormitorios', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'bathrooms', label: 'Baños', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'toilets', label: 'Aseos', type: 'stepper', group: 'Dimensiones' },
        { key: 'livingRooms', label: 'Salones', type: 'stepper', group: 'Dimensiones' },
        { key: 'kitchens', label: 'Cocinas', type: 'stepper', group: 'Dimensiones' },
        { key: 'garageSpaces', label: 'Plazas de garaje', type: 'stepper', group: 'Dimensiones' },
        { key: 'area', label: 'Superficie construida (m²)', type: 'number', recommended: true, group: 'Superficies' },
        { key: 'usableArea', label: 'Superficie útil (m²)', type: 'number', group: 'Superficies' },
        { key: 'plotArea', label: 'Superficie de parcela (m²)', type: 'number', group: 'Superficies' },
        { key: 'terraceArea', label: 'Superficie de terraza (m²)', type: 'number', group: 'Superficies' },
        { key: 'gardenArea', label: 'Superficie de jardín (m²)', type: 'number', group: 'Superficies' },
        { key: 'balconyArea', label: 'Superficie de balcón (m²)', type: 'number', group: 'Superficies' },
        { key: 'storageArea', label: 'Superficie de trastero (m²)', type: 'number', group: 'Superficies' },
        ...sheetGroup('surfaces', 'Superficies'),
        ...sheetGroup('distribution', 'Distribución'),
        { key: 'condition', label: 'Estado físico', type: 'select', options: CONDITION_OPTIONS, optionLabels: CONDITION_LABELS, group: 'Estado' },
        { key: 'furnished', label: 'Amueblado', type: 'select', options: FURNISHED_OPTIONS, optionLabels: FURNISHED_LABELS, group: 'Estado' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS, group: 'Certificación' },
        { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS, group: 'Certificación' },
        { key: 'hasElevator', label: 'Ascensor', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasPool', label: 'Piscina', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarage', label: 'Garaje', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasTerrace', label: 'Terraza', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarden', label: 'Jardín', type: 'checkbox', group: 'Equipamiento' },
        { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox', group: 'Equipamiento' },
        { key: 'accessible', label: 'Accesible', type: 'checkbox', group: 'Equipamiento' },
        {
          key: 'featuresReviewedAt',
          label: 'Características repasadas',
          type: 'checkbox',
          hint: 'Márcalo tras revisar el equipamiento de arriba — así un "No" marcado se distingue de "todavía sin repasar" (usado por el motor de compatibilidad).',
          group: 'Equipamiento',
        },
      ],
    },
    {
      key: 'rooms',
      label: 'Estancias personalizadas',
      icon: 'layers',
      description: 'Dormitorios, despachos u otras estancias con su propia superficie y orientación.',
      kind: 'rooms',
      childResource: 'developer-property-rooms',
      parentField: 'developerPropertyId',
    },
    SHEET_BUILDING_SECTION,
    SHEET_INSTALLATIONS_SECTION,
    {
      key: 'description',
      label: 'Descripción',
      icon: 'doc',
      description: 'Contenido editorial y puntos clave para la ficha pública.',
      kind: 'fields',
      fields: [
        { key: 'description', label: 'Descripción', type: 'rich-text', span: 2, recommended: true, group: 'Contenido principal' },
        { key: 'keyHighlights', label: 'Puntos clave', type: 'textarea', span: 2, group: 'Contenido principal' },
        { key: 'masterPlanDescription', label: 'Descripción del master plan', type: 'rich-text', span: 2, group: 'Documentación técnica' },
        { key: 'floorPlanDescription', label: 'Descripción de los planos', type: 'rich-text', span: 2, group: 'Documentación técnica' },
        { key: 'locationMapDescription', label: 'Descripción del mapa de ubicación', type: 'rich-text', span: 2, group: 'Documentación técnica' },
      ],
    },
    {
      key: 'media',
      label: 'Multimedia',
      icon: 'widget',
      description: 'Logo, portada e imágenes destacadas del proyecto.',
      kind: 'fields',
      fields: [
        { key: 'logo', label: 'Logo', type: 'image', group: 'Identidad visual' },
        { key: 'coverImage', label: 'Imagen de portada', type: 'image', recommended: true, group: 'Identidad visual' },
        { key: 'masterPlanImage', label: 'Imagen del master plan', type: 'image', group: 'Planos y ubicación' },
        { key: 'locationMap', label: 'Mapa de ubicación', type: 'image', group: 'Planos y ubicación' },
        { key: 'videoUrl', label: 'Vídeo', type: 'video', span: 2, group: 'Vídeo' },
        ...sheetGroup('media', 'Tour virtual').map((f) => ({ ...f, span: 2 as const })),
        { key: 'dronePhoto', label: 'Foto aérea (drone)', type: 'image', group: 'Fotografía premium' },
        { key: 'nightPhoto', label: 'Foto nocturna', type: 'image', group: 'Fotografía premium' },
        { key: 'beforePhoto', label: 'Foto "antes"', type: 'image', group: 'Fotografía premium' },
        { key: 'afterPhoto', label: 'Foto "después"', type: 'image', group: 'Fotografía premium' },
        { key: 'aiStagedPhoto', label: 'Foto con staging IA', type: 'image', group: 'Fotografía premium' },
      ],
    },
    {
      key: 'gallery',
      label: 'Galería y multimedia',
      icon: 'widget',
      description: 'Fotografías del proyecto (orden, portada, datos de cada foto, ocultar y descargar) y sus vídeos, tours, renders, PDF, drone y 360°.',
      kind: 'gallery',
      childResource: 'project-images',
      parentField: 'developerPropertyId',
    },
    {
      key: 'floorplans',
      label: 'Planos',
      icon: 'layers',
      description: 'Planos por categoría y tipo de unidad.',
      kind: 'child-table',
      childResource: 'floor-plans',
      parentField: 'developerPropertyId',
      columns: [
        { key: 'category', label: 'Categoría', type: 'text' },
        { key: 'unitType', label: 'Tipo de unidad', type: 'text' },
        { key: 'floorDetails', label: 'Detalles', type: 'text' },
        { key: 'sizes', label: 'Tamaños', type: 'text' },
        { key: 'type', label: 'Tipo', type: 'text' },
        { key: 'image', label: 'Imagen', type: 'image' },
      ],
    },
    {
      key: 'unittypes',
      label: 'Tipos de unidad',
      icon: 'badge',
      description: 'Tipologías disponibles y sus tamaños.',
      kind: 'child-table',
      childResource: 'property-types',
      parentField: 'developerPropertyId',
      columns: [
        { key: 'propertyType', label: 'Tipo', type: 'text', required: true },
        { key: 'unitType', label: 'Unidad', type: 'text', required: true },
        { key: 'size', label: 'Tamaño', type: 'text', required: true },
      ],
    },
    {
      key: 'social',
      label: 'Redes sociales',
      icon: 'sparkles',
      description: 'Redes sociales asociadas a esta promoción.',
      kind: 'social',
      childResource: 'social-media',
      parentField: 'developerPropertyId',
    },
    {
      key: 'commercial',
      label: 'Comercial / Inversión',
      icon: 'chart',
      description: 'Comercial asignado, condiciones y datos de inversión.',
      kind: 'fields',
      fields: [
        { key: 'agentId', label: 'Comercial asignado', type: 'agent', group: 'Comercial' },
        ...sheetGroup('identification', 'Comercial').filter((f) => f.key === 'officeId' || f.key === 'teamId'),
        { key: 'mandateType', label: 'Tipo de mandato', type: 'text', group: 'Comercial' },
        { key: 'exclusiveFrom', label: 'Exclusividad — inicio', type: 'date', hint: DATE_HINT_LEGACY, group: 'Comercial' },
        { key: 'exclusiveUntil', label: 'Exclusividad — vencimiento', type: 'date', hint: 'El resumen avisa cuando falten 30 días o menos y cuando haya vencido; el listado filtra por ello.', group: 'Comercial' },
        { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox', group: 'Inversión' },
        LEGACY_RESERVED,
        { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox', group: 'Inversión' },
        { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number', group: 'Inversión' },
        LEGACY_SERVICE_CHARGE,
      ],
    },
    OWNERS_SECTION,
    SHEET_LEGAL_SECTION,
    DOCUMENTS_SECTION,
    PORTALS_SECTION,
    BUYER_MATCHES_SECTION,
  ],

  // Parity with 'developer-properties' (migration 0059) — every field above
  // that's equally applicable to a resale unit now exists here too. No
  // 'unittypes' section: "Tipos de unidad" is a menu of typologies for a
  // multi-unit development under construction, which doesn't apply to a
  // single resale property — deliberately not added, not a gap.
  properties: [
    {
      key: 'info',
      label: 'Información básica',
      icon: 'doc',
      description: 'Datos principales de la vivienda.',
      kind: 'fields',
      fields: [
        { key: 'slug', label: 'Slug', type: 'text', span: 2, group: 'Identificación' },
        { key: 'reference', label: 'Referencia interna', type: 'text', hint: 'Se genera sola si la dejas vacía.', group: 'Identificación' },
        { key: 'agencyReference', label: 'Referencia de agencia', type: 'text', group: 'Identificación' },
        { key: 'externalSource', label: 'Origen externo', type: 'text', hint: 'De dónde procede si viene de un sistema externo.', group: 'Identificación' },
        { key: 'externalReference', label: 'Referencia externa', type: 'text', group: 'Identificación' },
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS, optionLabels: PROPERTY_TYPE_LABELS, recommended: true, group: 'Clasificación' },
        ...sheetGroup('identification', 'Clasificación').filter((f) => f.key === 'subtype'),
        { key: 'transactionType', label: 'Operación', type: 'select', options: ['sale', 'rent'], optionLabels: { sale: 'Venta', rent: 'Alquiler' }, recommended: true, group: 'Clasificación' },
        {
          key: 'status',
          label: CATALOG_STATUS_TITLES.agent,
          type: 'select',
          options: ['available', 'sold'],
          optionLabels: { available: 'Disponible', sold: 'Vendida' },
          hint: 'La que lee el matching. «Vendida» pasa también a «Vendida» un estado comercial ya indicado.',
          group: 'Clasificación',
        },
        ...commercialStatusField('Clasificación', 'agent'),
        { key: 'yearBuilt', label: 'Año de construcción', type: 'number', group: 'Clasificación' },
        ...sheetGroup('identification', 'Identificación comercial').filter((f) => f.key === 'commercialCode'),
        { key: 'captureDate', label: 'Fecha de captación', type: 'date', hint: DATE_HINT_LEGACY, group: 'Captación' },
        { key: 'captureSource', label: 'Origen de captación', type: 'text', group: 'Captación' },
        { key: 'keyHighlights', label: 'Puntos clave', type: 'textarea', span: 2, group: 'Contenido' },
      ],
    },
    {
      key: 'location',
      label: 'Ubicación',
      icon: 'building',
      description: 'Dirección completa y ubicación en el mapa.',
      kind: 'location',
      latField: 'lat',
      lngField: 'lng',
      fields: [
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
        ...sheetGroupFlat('location'),
        { key: 'location', label: 'Referencia de ubicación (heredado)', type: 'text', span: 2, hint: 'Campo de texto libre anterior. Se conserva por compatibilidad; usa los campos de arriba para direcciones nuevas.' },
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
      ],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      description: 'Precio de venta o alquiler.',
      kind: 'fields',
      fields: [
        { key: 'price', label: 'Precio de venta', labelFor: priceLabel('Precio de venta'), type: 'number', required: true, group: 'Precio principal' },
        { key: 'priceOld', label: 'Precio anterior', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.', group: 'Precio principal' },
        PRICE_PER_M2,
        PRICE_CHANGE_REASON,
        ...SHEET_PRICE_FIELDS,
        { key: 'paymentPlan', label: 'Plan de pagos', type: 'payment-plan', span: 2, group: 'Plan de pagos' },
      ],
    },
    {
      key: 'features',
      label: 'Características',
      icon: 'layers',
      description: 'Superficie, dormitorios, baños y equipamiento.',
      kind: 'fields',
      fields: [
        { key: 'area', label: 'Superficie construida (m²)', type: 'number', recommended: true, group: 'Dimensiones' },
        { key: 'bedrooms', label: 'Dormitorios', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'bathrooms', label: 'Baños', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'toilets', label: 'Aseos', type: 'stepper', group: 'Dimensiones' },
        { key: 'livingRooms', label: 'Salones', type: 'stepper', group: 'Dimensiones' },
        { key: 'kitchens', label: 'Cocinas', type: 'stepper', group: 'Dimensiones' },
        { key: 'garageSpaces', label: 'Plazas de garaje', type: 'stepper', group: 'Dimensiones' },
        { key: 'usableArea', label: 'Superficie útil (m²)', type: 'number', group: 'Superficies' },
        { key: 'plotArea', label: 'Superficie de parcela (m²)', type: 'number', group: 'Superficies' },
        { key: 'terraceArea', label: 'Superficie de terraza (m²)', type: 'number', group: 'Superficies' },
        { key: 'gardenArea', label: 'Superficie de jardín (m²)', type: 'number', group: 'Superficies' },
        { key: 'balconyArea', label: 'Superficie de balcón (m²)', type: 'number', group: 'Superficies' },
        { key: 'storageArea', label: 'Superficie de trastero (m²)', type: 'number', group: 'Superficies' },
        ...sheetGroup('surfaces', 'Superficies'),
        ...sheetGroup('distribution', 'Distribución'),
        { key: 'condition', label: 'Estado físico', type: 'select', options: CONDITION_OPTIONS, optionLabels: CONDITION_LABELS, group: 'Estado' },
        { key: 'furnished', label: 'Amueblado', type: 'select', options: FURNISHED_OPTIONS, optionLabels: FURNISHED_LABELS, group: 'Estado' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS, group: 'Certificación' },
        { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS, group: 'Certificación' },
        { key: 'hasElevator', label: 'Ascensor', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasPool', label: 'Piscina', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarage', label: 'Garaje', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasTerrace', label: 'Terraza', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarden', label: 'Jardín', type: 'checkbox', group: 'Equipamiento' },
        { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox', group: 'Equipamiento' },
        { key: 'accessible', label: 'Accesible', type: 'checkbox', group: 'Equipamiento' },
        {
          key: 'featuresReviewedAt',
          label: 'Características repasadas',
          type: 'checkbox',
          hint: 'Márcalo tras revisar el equipamiento de arriba — así un "No" marcado se distingue de "todavía sin repasar" (usado por el motor de compatibilidad).',
          group: 'Equipamiento',
        },
      ],
    },
    {
      key: 'rooms',
      label: 'Estancias personalizadas',
      icon: 'layers',
      description: 'Dormitorios, despachos u otras estancias con su propia superficie y orientación.',
      kind: 'rooms',
      childResource: 'agent-property-rooms',
      parentField: 'propertyId',
    },
    SHEET_BUILDING_SECTION,
    SHEET_INSTALLATIONS_SECTION,
    {
      key: 'description',
      label: 'Descripción',
      icon: 'doc',
      description: 'Título y descripción de la vivienda, por idioma.',
      kind: 'translations',
    },
    {
      key: 'media',
      label: 'Multimedia',
      icon: 'widget',
      description: 'Imagen principal y vídeo de la vivienda.',
      kind: 'fields',
      fields: [
        { key: 'mainImage', label: 'Imagen principal', type: 'image', recommended: true, group: 'Identidad visual' },
        { key: 'videoUrl', label: 'Vídeo', type: 'video', span: 2, group: 'Vídeo' },
        ...sheetGroup('media', 'Tour virtual').map((f) => ({ ...f, span: 2 as const })),
        { key: 'dronePhoto', label: 'Foto aérea (drone)', type: 'image', group: 'Fotografía premium' },
        { key: 'nightPhoto', label: 'Foto nocturna', type: 'image', group: 'Fotografía premium' },
        { key: 'beforePhoto', label: 'Foto "antes"', type: 'image', group: 'Fotografía premium' },
        { key: 'afterPhoto', label: 'Foto "después"', type: 'image', group: 'Fotografía premium' },
        { key: 'aiStagedPhoto', label: 'Foto con staging IA', type: 'image', group: 'Fotografía premium' },
      ],
    },
    {
      key: 'gallery',
      label: 'Galería y multimedia',
      icon: 'widget',
      description: 'Fotografías de la vivienda (orden, portada, datos de cada foto, ocultar y descargar) y sus vídeos, tours, renders, PDF, drone y 360°.',
      kind: 'gallery',
      childResource: 'gallery-images',
      parentField: 'propertyId',
      coverField: 'mainImage',
    },
    {
      key: 'floorplans',
      label: 'Planos',
      icon: 'layers',
      description: 'Planos de la vivienda, si están disponibles.',
      kind: 'child-table',
      childResource: 'agent-property-floor-plans',
      parentField: 'propertyId',
      columns: [
        { key: 'category', label: 'Categoría', type: 'text' },
        { key: 'unitType', label: 'Tipo de unidad', type: 'text' },
        { key: 'floorDetails', label: 'Detalles', type: 'text' },
        { key: 'sizes', label: 'Tamaños', type: 'text' },
        { key: 'type', label: 'Tipo', type: 'text' },
        { key: 'image', label: 'Imagen', type: 'image' },
      ],
    },
    {
      key: 'social',
      label: 'Redes sociales',
      icon: 'sparkles',
      description: 'Redes sociales asociadas a esta vivienda.',
      kind: 'social',
      childResource: 'agent-property-social-media',
      parentField: 'propertyId',
    },
    {
      key: 'commercial',
      label: 'Comercial / Inversión',
      icon: 'chart',
      description: 'Comercial asignado, condiciones y datos de inversión.',
      kind: 'fields',
      fields: [
        { key: 'agentId', label: 'Comercial asignado', type: 'agent', span: 2, group: 'Comercial' },
        ...sheetGroup('identification', 'Comercial').filter((f) => f.key === 'officeId' || f.key === 'teamId'),
        { key: 'mandateType', label: 'Tipo de mandato', type: 'text', group: 'Comercial' },
        { key: 'exclusiveFrom', label: 'Exclusividad — inicio', type: 'date', hint: DATE_HINT_LEGACY, group: 'Comercial' },
        { key: 'exclusiveUntil', label: 'Exclusividad — vencimiento', type: 'date', hint: 'El resumen avisa cuando falten 30 días o menos y cuando haya vencido; el listado filtra por ello.', group: 'Comercial' },
        { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox', group: 'Inversión' },
        LEGACY_RESERVED,
        { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox', group: 'Inversión' },
        { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number', group: 'Inversión' },
        LEGACY_SERVICE_CHARGE,
      ],
    },
    OWNERS_SECTION,
    SHEET_LEGAL_SECTION,
    DOCUMENTS_SECTION,
    PORTALS_SECTION,
    BUYER_MATCHES_SECTION,
  ],
}

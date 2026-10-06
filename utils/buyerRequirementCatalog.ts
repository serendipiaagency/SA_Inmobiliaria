/**
 * Catálogo de la necesidad del comprador (FASE 10) y de los criterios del
 * motor de matching (FASE 11), con su etiqueta en castellano. Una sola lista
 * para el servidor (validación en server/utils/buyerRequirements/service.ts,
 * líneas del desglose en server/utils/matching/engine.ts) y el panel (editor
 * de la necesidad, tarjetas, desglose). Sólo datos: nada de este fichero
 * toca la base de datos ni depende de Nuxt, así que el motor puede
 * importarlo sin dejar de ser una función pura.
 */

export const REQUIREMENT_STATUSES = ['active', 'paused', 'fulfilled', 'archived'] as const
export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  paused: 'En pausa',
  fulfilled: 'Cubierta',
  archived: 'Archivada',
}

/** Misma taxonomía que `transaction_type` de los dos catálogos de propiedades. */
export const REQUIREMENT_OPERATIONS = ['sale', 'rent'] as const
export const REQUIREMENT_OPERATION_LABELS: Record<string, string> = { sale: 'Compra', rent: 'Alquiler' }

export const IMPORTANCES = ['required', 'preferred', 'indifferent'] as const
export type Importance = (typeof IMPORTANCES)[number]
export const IMPORTANCE_LABELS: Record<Importance, string> = {
  required: 'Imprescindible',
  preferred: 'Preferible',
  indifferent: 'Indiferente',
}

export const URGENCIES = ['low', 'medium', 'high', 'urgent'] as const
export const URGENCY_LABELS: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }

/** Preferencia de construcción. NUNCA se deduce del catálogo en el que se dio de alta la ficha. */
export const BUILD_PREFS = ['new', 'second_hand', 'renovated'] as const
export const BUILD_PREF_LABELS: Record<string, string> = { new: 'Obra nueva', second_hand: 'Segunda mano', renovated: 'Reformado' }

/** Preferencia de estado físico del inmueble (no el estado comercial). */
export const CONDITION_PREFS = ['good', 'to_reform', 'any'] as const
export const CONDITION_PREF_LABELS: Record<string, string> = {
  good: 'En buen estado (para entrar a vivir)',
  to_reform: 'Para reformar',
  any: 'Cualquier estado',
}

export const MORTGAGE_STATUSES = ['not_needed', 'required', 'requested', 'preapproved', 'approved'] as const
export const MORTGAGE_STATUS_LABELS: Record<string, string> = {
  not_needed: 'No la necesita',
  required: 'La necesita (sin solicitar)',
  requested: 'Solicitada',
  preapproved: 'Preaprobada',
  approved: 'Aprobada',
}

/**
 * Características que se piden como sí/no. `column` es la columna del
 * inmueble de la que sale el dato y `reviewed` dice cómo se lee un 0:
 *
 * - `reviewed: true`  → columna `NOT NULL DEFAULT 0` de agent_properties /
 *   developer_properties: un 0 sólo es un «no» si alguien repasó las
 *   características (`features_reviewed_at`); si no, es «no consta».
 * - `reviewed: false` → columna de `property_details`, que admite NULL: NULL
 *   es «no consta» y un 0 es un «no» que alguien escribió.
 */
export const FEATURE_CRITERIA = ['terrace', 'garage', 'elevator', 'pool', 'garden', 'accessible', 'pets', 'airConditioning'] as const
export type FeatureCriterion = (typeof FEATURE_CRITERIA)[number]
/**
 * `anyOf` (cierre D1p): columnas de `property_details` que también cuentan
 * como la característica. «Piscina» es la casilla genérica de la fila, la
 * piscina privada o la comunitaria de la ficha ampliada; «Jardín», igual. Con
 * cualquiera marcada, SÍ; el «no» lo da la casilla genérica (con su política
 * de repaso) o que las dos de la ficha ampliada digan «no» explícitamente.
 * Mismo criterio que el filtro del listado (`PROPERTY_FEATURE_DETAIL_ALTERNATIVES`).
 */
export const FEATURE_SOURCES: Record<FeatureCriterion, { column: string; reviewed: boolean; anyOf?: string[] }> = {
  terrace: { column: 'hasTerrace', reviewed: true },
  garage: { column: 'hasGarage', reviewed: true },
  elevator: { column: 'hasElevator', reviewed: true },
  pool: { column: 'hasPool', reviewed: true, anyOf: ['hasPrivatePool', 'hasCommunityPool'] },
  garden: { column: 'hasGarden', reviewed: true, anyOf: ['hasPrivateGarden', 'hasCommunityGarden'] },
  accessible: { column: 'accessible', reviewed: true },
  pets: { column: 'petsAllowed', reviewed: true },
  airConditioning: { column: 'hasAirConditioning', reviewed: false },
}

/**
 * Criterios con valor propio en `buyer_requirements` (precio, superficie…):
 * aquí sólo se guarda su importancia, en `buyer_requirement_criteria`.
 */
export const VALUE_CRITERIA = ['propertyType', 'price', 'area', 'bedrooms', 'bathrooms', 'zone', 'condition', 'build'] as const
export type ValueCriterion = (typeof VALUE_CRITERIA)[number]

/** Todo lo que admite importancia (imprescindible / preferible / indiferente). */
export const IMPORTANCE_CRITERIA = [...VALUE_CRITERIA, ...FEATURE_CRITERIA] as const

export const CRITERION_LABELS: Record<string, string> = {
  operation: 'Operación',
  propertyType: 'Tipo de inmueble',
  price: 'Precio',
  area: 'Superficie',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  zone: 'Zona',
  condition: 'Estado',
  build: 'Obra',
  terrace: 'Terraza',
  garage: 'Garaje',
  elevator: 'Ascensor',
  pool: 'Piscina',
  garden: 'Jardín',
  accessible: 'Accesible',
  pets: 'Admite mascotas',
  airConditioning: 'Aire acondicionado',
}

/**
 * Importancia que se aplica cuando la necesidad no la declara. El tipo de
 * inmueble es imprescindible por defecto: quien busca «piso» no quiere ver
 * locales, y el prefiltro SQL de Necesidad → inmuebles siempre lo trató así;
 * ahora el motor dice lo mismo en las dos direcciones. Todo lo demás puntúa
 * sin descartar.
 */
export const DEFAULT_IMPORTANCE: Record<string, Importance> = { propertyType: 'required' }

export function defaultImportanceOf(criterion: string): Importance {
  return DEFAULT_IMPORTANCE[criterion] || 'preferred'
}

/** Importancias que se pueden elegir para cada criterio (el precio nunca es indiferente: si no importa, se deja en blanco). */
export function allowedImportances(criterion: string): readonly Importance[] {
  if (criterion === 'price') return ['required', 'preferred']
  return IMPORTANCES
}

/**
 * Lo que filtra SIEMPRE, se elija la importancia que se elija. Se enseña en
 * el editor y en la ayuda para que nadie se sorprenda de que un inmueble no
 * aparezca.
 */
export const HARD_FILTER_NOTES: { key: string; text: string }[] = [
  { key: 'operation', text: 'Operación: comprar no es alquilar. Un inmueble de la otra operación nunca aparece.' },
  { key: 'price', text: 'Precio: lo que se pase en más de un 10 % del máximo (o se quede más de un 10 % por debajo del mínimo) nunca aparece. Dentro de ese margen, la importancia decide.' },
  { key: 'excludedZones', text: 'Zonas excluidas: un inmueble en una zona excluida queda siempre descartado, aunque la zona sea «preferible».' },
  { key: 'propertyType', text: 'Tipo de inmueble: imprescindible por defecto. Si lo bajas a «preferible» o «indiferente», aparecen también otros tipos.' },
]

/** Estado de la decisión comercial sobre un par necesidad ↔ inmueble (PropertyMatch). */
export const MATCH_STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  selected: 'Seleccionado',
  sent: 'Enviado',
  viewing: 'Visitado',
  offered: 'Ofertado',
  discarded: 'Descartado',
}

/** Tipos de zona del editor: cada zona es UNA referencia estructurada (ZoneRef), nunca «Chamberí, Salamanca» en un texto. */
export const ZONE_KINDS = ['district', 'city', 'postalCode', 'label'] as const
export type ZoneKind = (typeof ZONE_KINDS)[number]
export const ZONE_KIND_LABELS: Record<ZoneKind, string> = {
  district: 'Distrito / barrio',
  city: 'Localidad',
  postalCode: 'Código postal',
  label: 'Urbanización u otra zona',
}

export interface ZoneRefLike {
  communityId?: number
  locationId?: number
  city?: string
  district?: string
  postalCode?: string
  label?: string
}

/** El nombre legible de una zona estructurada. */
export function zoneLabel(zone: ZoneRefLike): string {
  return String(zone.label || zone.district || zone.city || zone.postalCode || (zone.communityId ? `Urbanización #${zone.communityId}` : '') || 'Zona')
}

/** Construye la referencia estructurada de una zona a partir de su tipo y su nombre. */
export function zoneFromInput(kind: ZoneKind, value: string): ZoneRefLike | null {
  const v = value.trim()
  if (!v) return null
  if (kind === 'district') return { district: v, label: v }
  if (kind === 'city') return { city: v, label: v }
  if (kind === 'postalCode') return { postalCode: v, label: v }
  return { label: v }
}

/** Qué tipo de zona es una referencia guardada (para enseñarla en el editor). */
export function zoneKindOf(zone: ZoneRefLike): ZoneKind {
  if (zone.district) return 'district'
  if (zone.city) return 'city'
  if (zone.postalCode) return 'postalCode'
  return 'label'
}

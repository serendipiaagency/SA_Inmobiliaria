/**
 * Ficha ampliada de la propiedad (núcleo inmobiliario, FASES 1-7) — catálogo
 * ÚNICO compartido por el servidor (validación y persistencia en
 * server/utils/properties/extendedSheet.ts) y el editor
 * (composables/usePropertyBuilderConfig.ts). Una sola lista: el error de
 * mantener la misma lista de campos a mano en tres sitios ya se cometió una
 * vez (ver docs/property-schema-registry.md) y no se repite aquí.
 *
 * Los valores se guardan en dos tablas 1:1 con la propiedad
 * (`property_details`, `property_legal_economics`, migración 0086) porque D1
 * no admite más de 100 columnas por tabla. Para el editor y la API son campos
 * planos más de la ficha: GET los devuelve junto a la fila y PUT/POST los
 * acepta en el mismo cuerpo.
 */

/** Tipos de inmueble, iguales en los dos catálogos. La clave guardada no cambia (compatibilidad con lo ya publicado); lo que se lee es la etiqueta. */
export const PROPERTY_TYPES = [
  'Apartment',
  'House',
  'Villa',
  'Townhouse',
  'Penthouse',
  'Duplex',
  'Studio',
  'Finca',
  'Land',
  'Retail',
  'Office',
  'Warehouse',
  'Garage',
  'Building',
  'Development',
] as const
export type PropertyTypeKey = (typeof PROPERTY_TYPES)[number]

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  Apartment: 'Piso',
  House: 'Casa',
  Villa: 'Chalet',
  Townhouse: 'Adosado',
  Penthouse: 'Ático',
  Duplex: 'Dúplex',
  Studio: 'Estudio',
  Finca: 'Finca',
  Land: 'Terreno',
  Retail: 'Local',
  Office: 'Oficina',
  Warehouse: 'Nave',
  Garage: 'Garaje',
  Building: 'Edificio',
  Development: 'Promoción',
}

/**
 * Estado físico del inmueble (columna `condition` de los dos catálogos) —
 * distinto del estado comercial. Lo usan el editor y el motor de matching
 * (criterio «Estado» frente a `conditionPref` de la necesidad).
 */
export const PROPERTY_CONDITIONS = ['new', 'excellent', 'good', 'to_renovate', 'to_reform'] as const
export const PROPERTY_CONDITION_LABELS: Record<string, string> = {
  new: 'A estrenar',
  excellent: 'Excelente',
  good: 'Buen estado',
  to_renovate: 'A renovar',
  to_reform: 'A reformar',
}

/** Subtipos por tipo. Un subtipo sólo es válido para su tipo (lo comprueba el servidor). */
export const PROPERTY_SUBTYPES: Record<string, Record<string, string>> = {
  Apartment: { flat: 'Piso', apartment: 'Apartamento', loft: 'Loft', ground_floor: 'Bajo', ground_floor_garden: 'Bajo con jardín', mezzanine: 'Entresuelo' },
  House: { detached: 'Casa independiente', semi_detached: 'Casa pareada', terraced: 'Casa adosada', village_house: 'Casa de pueblo', bungalow: 'Bungalow' },
  Villa: { detached_villa: 'Chalet independiente', semi_detached_villa: 'Chalet pareado', terraced_villa: 'Chalet adosado' },
  Townhouse: { corner: 'Adosado de esquina', middle: 'Adosado central' },
  Penthouse: { penthouse: 'Ático', penthouse_duplex: 'Ático dúplex', sub_penthouse: 'Sobreático' },
  Duplex: { duplex: 'Dúplex', triplex: 'Tríplex' },
  Studio: { studio: 'Estudio', open_plan: 'Diáfano' },
  Finca: { rustic_estate: 'Finca rústica', country_house: 'Casa de campo', farmhouse: 'Cortijo / masía', hunting_estate: 'Finca de recreo' },
  Land: { urban: 'Suelo urbano', developable: 'Suelo urbanizable', rustic_land: 'Suelo rústico' },
  Retail: { street_retail: 'A pie de calle', shopping_centre: 'En centro comercial', mezzanine_retail: 'En entreplanta' },
  Office: { office_building: 'En edificio de oficinas', mixed_building: 'En edificio mixto', coworking_space: 'Espacio coworking' },
  Warehouse: { industrial: 'Nave industrial', logistics: 'Nave logística', workshop: 'Taller' },
  Garage: { car: 'Plaza de coche', motorbike: 'Plaza de moto', double: 'Plaza doble', closed: 'Cerrada' },
  Building: { residential_building: 'Edificio residencial', office_block: 'Edificio de oficinas', hotel: 'Hotel', mixed_use: 'Uso mixto' },
  Development: { new_build: 'Obra nueva', off_plan: 'Sobre plano', under_construction: 'En construcción', completed: 'Terminada' },
}

export function propertyTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return PROPERTY_TYPE_LABELS[value] || value
}

/**
 * Clave i18n del rótulo de un tipo en la WEB PÚBLICA (`filters.type.apartment`…).
 * En castellano el diccionario dice lo mismo que `PROPERTY_TYPE_LABELS` (lo
 * comprueba una prueba); en el resto de idiomas, su traducción. Sin entrada,
 * `t()` cae a la etiqueta del catálogo.
 */
export function propertyTypeI18nKey(type: string): string {
  return `filters.type.${type.toLowerCase()}`
}

/**
 * Los tipos distintos que una agencia tiene publicados, en el orden del
 * catálogo común; un valor antiguo fuera del catálogo va al final, tal cual
 * (sigue siendo filtrable: el servidor compara con lo guardado).
 */
export function orderPropertyTypes(values: unknown[]): string[] {
  const present = new Set(values.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))
  const known = PROPERTY_TYPES.filter((t) => present.has(t))
  const unknown = [...present].filter((v) => !(PROPERTY_TYPES as readonly string[]).includes(v)).sort((a, b) => a.localeCompare(b, 'es'))
  return [...known, ...unknown]
}

export function isSubtypeOf(subtype: unknown, type: unknown): boolean {
  return !!type && !!subtype && String(subtype) in (PROPERTY_SUBTYPES[String(type)] || {})
}

export function propertySubtypeLabel(type: string | null | undefined, subtype: string | null | undefined): string {
  if (!subtype) return '—'
  return (type && PROPERTY_SUBTYPES[type]?.[subtype]) || subtype
}

export type SheetFieldType = 'text' | 'number' | 'integer' | 'bool' | 'select' | 'date' | 'url' | 'relation' | 'textarea'

export interface SheetField {
  key: string
  label: string
  type: SheetFieldType
  /** Tabla en la que se guarda. */
  store: 'details' | 'legal'
  options?: string[]
  optionLabels?: Record<string, string>
  /** Para `relation`: recurso del panel del que salen las opciones (y cuya pertenencia a la organización valida el servidor). */
  relationResource?: 'offices' | 'teams'
  hint?: string
  min?: number
  max?: number
}

/**
 * Estado comercial común a los dos catálogos (`property_details.commercial_status`).
 * Distinto del `status` de cada catálogo (fase de la obra en obra nueva,
 * disponibilidad en 2ª mano): ver utils/propertyCommercialStatus.ts.
 */
export const PROPERTY_COMMERCIAL_STATUS_LABELS: Record<string, string> = { available: 'Disponible', reserved: 'Reservada', sold: 'Vendida', rented: 'Alquilada', withdrawn: 'Retirada', draft: 'Borrador' }
const COMMERCIAL_STATUS = PROPERTY_COMMERCIAL_STATUS_LABELS
const STREET_TYPES = { street: 'Calle', avenue: 'Avenida', square: 'Plaza', road: 'Carretera', boulevard: 'Paseo', way: 'Camino', passage: 'Pasaje', roundabout: 'Glorieta', urbanization: 'Urbanización', other: 'Otro' }
const FACADE = { brick: 'Ladrillo visto', render: 'Enfoscado / monocapa', stone: 'Piedra', ventilated: 'Fachada ventilada', glass: 'Muro cortina', other: 'Otra' }
const STRUCTURE = { concrete: 'Hormigón', steel: 'Metálica', load_bearing: 'Muros de carga', wood: 'Madera', mixed: 'Mixta' }
const EXT_INT = { exterior: 'Exterior', interior: 'Interior' }
const KITCHEN = { independent: 'Independiente', open: 'Abierta / americana', office: 'Con office', kitchenette: 'Kitchenette', none: 'Sin cocina' }
const FLOORING = { parquet: 'Parquet', tile: 'Gres / cerámica', marble: 'Mármol', laminate: 'Tarima / laminado', terrazzo: 'Terrazo', microcement: 'Microcemento', concrete: 'Hormigón pulido', other: 'Otro' }
const CARPENTRY = { aluminium: 'Aluminio', aluminium_thermal_break: 'Aluminio con rotura de puente térmico', pvc: 'PVC', wood: 'Madera', steel: 'Acero', other: 'Otra' }
const GLAZING = { single: 'Simple', double: 'Doble (climalit)', triple: 'Triple', low_emissive: 'Bajo emisivo', acoustic: 'Acústico' }
const HEATING = { none: 'Sin calefacción', central: 'Central', individual_gas: 'Individual de gas', electric: 'Eléctrica', heat_pump: 'Bomba de calor', radiant_floor: 'Suelo radiante', biomass: 'Biomasa', diesel: 'Gasóleo', other: 'Otra' }
const HOT_WATER = { gas: 'Gas', electric: 'Termo eléctrico', heat_pump: 'Aerotermia / bomba de calor', solar: 'Solar', central: 'Central', other: 'Otro' }
const VIEWS = { sea: 'Mar', mountain: 'Montaña', city: 'Ciudad', golf: 'Golf', park: 'Parque', river: 'Río', lake: 'Lago', open: 'Despejadas', street: 'Calle', courtyard: 'Patio interior' }
const COMMISSION_TYPE = { percentage: 'Porcentaje', fixed: 'Importe fijo' }
const REGISTRY_STATUS = { registered: 'Inscrita', pending: 'Pendiente de inscripción', not_registered: 'No inscrita', unknown: 'Sin verificar' }
const MORTGAGE_STATUS = { none: 'Libre de hipoteca', mortgaged: 'Con hipoteca', subrogable: 'Hipoteca subrogable', cancellation_pending: 'Pendiente de cancelar' }
const OCCUPANCY = { vacant: 'Libre', owner_occupied: 'Ocupada por el propietario', rented: 'Alquilada', illegally_occupied: 'Ocupada ilegalmente', unknown: 'Sin verificar' }
const ITE_STATUS = { passed: 'Favorable', unfavourable: 'Desfavorable', pending: 'Pendiente', not_required: 'No obligatoria' }
const LETTERS = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G' }

function sel(key: string, label: string, store: SheetField['store'], labels: Record<string, string>, extra: Partial<SheetField> = {}): SheetField {
  return { key, label, type: 'select', store, options: Object.keys(labels), optionLabels: labels, ...extra }
}
const d = (key: string, label: string, type: SheetFieldType, extra: Partial<SheetField> = {}): SheetField => ({ key, label, type, store: 'details', ...extra })
const l = (key: string, label: string, type: SheetFieldType, extra: Partial<SheetField> = {}): SheetField => ({ key, label, type, store: 'legal', ...extra })

/**
 * Todos los campos de la ficha ampliada, agrupados por bloque del encargo.
 * El orden importa: es el orden en el que el editor los enseña.
 */
export const PROPERTY_SHEET_GROUPS: { key: string; label: string; fields: SheetField[] }[] = [
  {
    key: 'identification',
    label: 'Identificación ampliada',
    fields: [
      d('commercialCode', 'Código comercial', 'text', { hint: 'El código con el que la agencia anuncia el inmueble (cartel, portales).' }),
      d('subtype', 'Subtipo', 'select', { hint: 'Depende del tipo de inmueble.' }),
      sel('commercialStatus', 'Estado comercial', 'details', COMMERCIAL_STATUS),
      d('officeId', 'Oficina', 'relation', { relationResource: 'offices' }),
      d('teamId', 'Equipo', 'relation', { relationResource: 'teams' }),
    ],
  },
  {
    key: 'location',
    label: 'Ubicación administrativa',
    fields: [
      d('region', 'Comunidad / región', 'text'),
      d('province', 'Provincia', 'text'),
      d('municipality', 'Municipio', 'text'),
      d('neighborhood', 'Barrio', 'text'),
      sel('streetType', 'Tipo de vía', 'details', STREET_TYPES),
      d('staircase', 'Escalera', 'text'),
    ],
  },
  {
    key: 'surfaces',
    label: 'Superficies adicionales',
    fields: [
      d('officeArea', 'Superficie de oficina (m²)', 'number', { min: 0 }),
      d('commercialArea', 'Superficie comercial (m²)', 'number', { min: 0 }),
      d('totalArea', 'Superficie total (m²)', 'number', { min: 0 }),
      d('computableArea', 'Superficie computable (m²)', 'number', { min: 0 }),
    ],
  },
  {
    key: 'distribution',
    label: 'Distribución',
    fields: [
      d('roomsTotal', 'Habitaciones (total de estancias)', 'integer', { min: 0, hint: 'Todas las estancias habitables; los dormitorios se indican aparte.' }),
      d('terracesCount', 'Nº de terrazas', 'integer', { min: 0 }),
      d('balconiesCount', 'Nº de balcones', 'integer', { min: 0 }),
      d('storeroomsCount', 'Nº de trasteros', 'integer', { min: 0 }),
      d('dressingRoomsCount', 'Nº de vestidores', 'integer', { min: 0 }),
      d('studiesCount', 'Nº de despachos', 'integer', { min: 0 }),
      d('floorsCount', 'Nº de plantas', 'integer', { min: 0 }),
    ],
  },
  {
    key: 'building',
    label: 'Edificio',
    fields: [
      d('renovationYear', 'Año de reforma', 'integer', { min: 1800, max: 2100 }),
      d('buildingFloors', 'Plantas del edificio', 'integer', { min: 0 }),
      d('buildingUnits', 'Nº de vecinos', 'integer', { min: 0 }),
      sel('facade', 'Fachada', 'details', FACADE),
      sel('structure', 'Estructura', 'details', STRUCTURE),
      d('hasConcierge', 'Conserje', 'bool'),
      d('hasDoorman', 'Portero', 'bool'),
    ],
  },
  {
    key: 'dwelling',
    label: 'Vivienda',
    fields: [
      sel('exteriorInterior', 'Exterior / interior', 'details', EXT_INT),
      sel('kitchenType', 'Tipo de cocina', 'details', KITCHEN),
      sel('flooring', 'Suelos', 'details', FLOORING),
      sel('carpentry', 'Carpintería exterior', 'details', CARPENTRY),
      sel('glazing', 'Cristales', 'details', GLAZING),
      d('ceilingHeight', 'Altura de techos (m)', 'number', { min: 0, max: 20 }),
      d('isRenovated', 'Reformado', 'bool'),
      d('hasBuiltInWardrobes', 'Armarios empotrados', 'bool'),
    ],
  },
  {
    key: 'installations',
    label: 'Instalaciones',
    fields: [
      sel('heating', 'Calefacción', 'details', HEATING),
      sel('hotWater', 'Agua caliente (ACS)', 'details', HOT_WATER),
      d('hasAirConditioning', 'Aire acondicionado', 'bool'),
      d('hasUnderfloorHeating', 'Suelo radiante', 'bool'),
      d('hasFireplace', 'Chimenea', 'bool'),
      d('hasHomeAutomation', 'Domótica', 'bool'),
      d('hasAlarm', 'Alarma', 'bool'),
      d('hasFiber', 'Fibra óptica', 'bool'),
      d('hasSolarPanels', 'Placas solares', 'bool'),
      d('hasAerothermal', 'Aerotermia', 'bool'),
    ],
  },
  {
    key: 'common',
    label: 'Zonas comunes',
    fields: [
      d('hasCommunityPool', 'Piscina comunitaria', 'bool'),
      d('hasCommunityGarden', 'Jardín comunitario', 'bool'),
      d('hasGym', 'Gimnasio', 'bool'),
      d('hasPaddle', 'Pádel', 'bool'),
      d('hasTennis', 'Tenis', 'bool'),
      d('hasPlayground', 'Zona infantil', 'bool'),
      d('hasCoworking', 'Coworking', 'bool'),
      d('hasSocialRoom', 'Salón social', 'bool'),
      d('hasSecurity', 'Seguridad / vigilancia', 'bool'),
    ],
  },
  {
    key: 'exterior',
    label: 'Exterior',
    fields: [
      sel('views', 'Vistas', 'details', VIEWS),
      d('isBeachfront', 'Primera línea', 'bool'),
      d('hasPrivateGarden', 'Jardín privado', 'bool'),
      d('hasPrivatePool', 'Piscina privada', 'bool'),
      d('hasPorch', 'Porche', 'bool'),
      d('hasPatio', 'Patio', 'bool'),
      d('hasBalcony', 'Balcón', 'bool'),
    ],
  },
  {
    key: 'media',
    label: 'Tour virtual',
    fields: [d('virtualTourUrl', 'Enlace del tour virtual', 'url', { hint: 'Matterport, Kuula u otro visor 360 (https://…).' })],
  },
  {
    key: 'sale',
    label: 'Venta',
    fields: [
      l('priceMinAuthorized', 'Precio mínimo autorizado', 'number', { min: 0, hint: 'Interno: el mínimo que el propietario ha autorizado. Nunca se publica.' }),
      l('priceRecommended', 'Precio recomendado', 'number', { min: 0, hint: 'Interno: el precio que recomienda la agencia (p. ej. tras una valoración).' }),
    ],
  },
  {
    key: 'rent',
    label: 'Alquiler',
    fields: [
      l('rentDeposit', 'Fianza', 'number', { min: 0 }),
      l('rentGuarantee', 'Depósito / garantía adicional', 'number', { min: 0 }),
      l('rentExpensesIncluded', 'Gastos incluidos en la renta', 'bool'),
    ],
  },
  {
    key: 'costs',
    label: 'Gastos del inmueble',
    fields: [
      l('communityFeeMonthly', 'Comunidad (mensual)', 'number', { min: 0 }),
      l('ibiAnnual', 'IBI (anual)', 'number', { min: 0 }),
      l('garbageTaxAnnual', 'Tasa de basuras (anual)', 'number', { min: 0 }),
    ],
  },
  {
    key: 'commissions',
    label: 'Comisiones',
    fields: [
      sel('commissionType', 'Tipo de comisión', 'legal', COMMISSION_TYPE),
      l('commissionValue', 'Comisión (importe o %)', 'number', { min: 0 }),
      l('commissionVatPct', 'IVA de la comisión (%)', 'number', { min: 0, max: 100 }),
      l('buyerFee', 'Honorarios del comprador', 'number', { min: 0 }),
      l('ownerFee', 'Honorarios del propietario', 'number', { min: 0 }),
    ],
  },
  {
    key: 'legal',
    label: 'Situación legal',
    fields: [
      l('cadastralReference', 'Referencia catastral', 'text', { hint: '20 caracteres (14 de la parcela + 4 del inmueble + 2 de control).' }),
      sel('registryStatus', 'Situación registral', 'legal', REGISTRY_STATUS),
      l('registryPropertyNumber', 'Finca registral', 'text'),
      l('landRegistry', 'Registro de la propiedad', 'text'),
      l('encumbrances', 'Cargas', 'textarea'),
      sel('mortgageStatus', 'Hipoteca', 'legal', MORTGAGE_STATUS),
      sel('occupancyStatus', 'Ocupación', 'legal', OCCUPANCY),
      l('licenses', 'Licencias', 'textarea'),
      l('habitabilityCertificate', 'Cédula de habitabilidad', 'text'),
      sel('iteStatus', 'ITE / IEE', 'legal', ITE_STATUS),
    ],
  },
  {
    key: 'energy',
    label: 'Certificado energético',
    fields: [
      l('energyCertificateNumber', 'Nº de registro del certificado', 'text'),
      l('energyCertificateExpiry', 'Caducidad del certificado', 'date'),
      l('energyConsumption', 'Consumo (kWh/m² año)', 'number', { min: 0 }),
      sel('emissionsRating', 'Letra de emisiones', 'legal', LETTERS),
      l('emissionsValue', 'Emisiones (kg CO₂/m² año)', 'number', { min: 0 }),
    ],
  },
]

export const PROPERTY_SHEET_FIELDS: SheetField[] = PROPERTY_SHEET_GROUPS.flatMap((g) => g.fields)
export const PROPERTY_SHEET_FIELD_MAP: Record<string, SheetField> = Object.fromEntries(PROPERTY_SHEET_FIELDS.map((f) => [f.key, f]))

/**
 * Las características sí/no de la ficha ampliada (`property_details`) por
 * bloque — edificio, vivienda, instalaciones, zonas comunes y exterior —, con
 * su rótulo del catálogo. Son las que ofrece el filtro «Más características»
 * del listado (`amenities=hasGym,hasFiber…`); el servidor sólo acepta estas
 * claves, así que nunca llega al SQL un nombre de columna que no sea de aquí.
 */
export const PROPERTY_AMENITY_GROUPS: { key: string; label: string; fields: { key: string; label: string }[] }[] = PROPERTY_SHEET_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  fields: g.fields.filter((f) => f.type === 'bool' && f.store === 'details').map((f) => ({ key: f.key, label: f.label })),
})).filter((g) => g.fields.length > 0)
export const PROPERTY_AMENITY_KEYS: string[] = PROPERTY_AMENITY_GROUPS.flatMap((g) => g.fields.map((f) => f.key))

/** Campos internos: nunca salen en la web pública ni en un feed de portal. */
export const PROPERTY_SHEET_INTERNAL_KEYS = new Set([
  'commercialCode',
  'officeId',
  'teamId',
  'priceMinAuthorized',
  'priceRecommended',
  'commissionType',
  'commissionValue',
  'commissionVatPct',
  'buyerFee',
  'ownerFee',
  'cadastralReference',
  'registryStatus',
  'registryPropertyNumber',
  'landRegistry',
  'encumbrances',
  'mortgageStatus',
  'occupancyStatus',
  'licenses',
  'habitabilityCertificate',
  'iteStatus',
  'energyCertificateNumber',
])

/** Precio por m² (venta) o renta por m² (alquiler) calculado — nunca se guarda: se deriva de precio y superficie construida. */
export function pricePerSquareMeter(price: unknown, area: unknown): number | null {
  const p = typeof price === 'number' ? price : Number(price)
  const a = typeof area === 'number' ? area : Number(area)
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return null
  return Math.round((p / a) * 100) / 100
}

/**
 * Renta mensual (cierre D1p): con operación «Alquiler», el único `price` de la
 * propiedad ES la renta de cada mes — no hay columna aparte ni migración. Lo
 * que cambia es cómo se lee: «Renta mensual» en el editor, «/mes» junto al
 * importe y «/m²·mes» en el precio por m².
 */
export function isRentTransaction(transactionType: unknown): boolean {
  return transactionType === 'rent'
}
/** Lo que va detrás del importe: « /mes» en alquiler, nada en venta. */
export function priceSuffixFor(transactionType: unknown): string {
  return isRentTransaction(transactionType) ? '/mes' : ''
}
/** Lo que va detrás del precio por m²: «/m²·mes» en alquiler, «/m²» en venta. */
export function pricePerM2SuffixFor(transactionType: unknown): string {
  return isRentTransaction(transactionType) ? '/m²·mes' : '/m²'
}

/** Tipos de documento de una propiedad (FASE 6). */
export const PROPERTY_DOCUMENT_TYPES = ['deed', 'land_registry_note', 'ibi', 'energy_certificate', 'plans', 'contract', 'mandate', 'licenses', 'receipts', 'community', 'other'] as const
export const PROPERTY_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  deed: 'Escritura',
  land_registry_note: 'Nota simple',
  ibi: 'Recibo de IBI',
  energy_certificate: 'Certificado energético',
  plans: 'Planos',
  contract: 'Contrato',
  mandate: 'Mandato / hoja de encargo',
  licenses: 'Licencias',
  receipts: 'Recibos',
  community: 'Comunidad de propietarios',
  other: 'Otros',
}

/**
 * Quién puede ver un documento (FASE 6): interno (sólo el equipo),
 * propietario (también los propietarios de la propiedad), comprador
 * autorizado (además, los contactos a los que se les concede) o público.
 */
export const DOCUMENT_VISIBILITIES = ['internal', 'owner', 'authorized_buyer', 'public'] as const
export const DOCUMENT_VISIBILITY_LABELS: Record<string, string> = {
  internal: 'Interno',
  owner: 'Propietario',
  authorized_buyer: 'Comprador autorizado',
  public: 'Público',
}

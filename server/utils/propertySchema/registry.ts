/**
 * PropertySchemaRegistry (FASE 26).
 *
 * Declara, por esquema de propiedad, qué campos aplican, cómo se agrupan,
 * cuáles son obligatorios (para guardar / publicar / portal) y cuáles son
 * candidatos a exposición pública o a un feed de portal. NO almacena
 * Properties ni sustituye a `agent_properties`/`developer_properties`
 * (Property Core sigue siendo la fuente de verdad — los valores viven ahí,
 * este módulo sólo describe comportamiento).
 *
 * Sin tabla propia a propósito: es un módulo TS puro (tipado fuerte, cero
 * configuración arbitraria en runtime) en vez de filas en D1 — ni el
 * megaprompt ni ningún caso de uso real pide que un tenant redefina sus
 * propios esquemas, y una tabla habría añadido un nivel de indirección sin
 * beneficio. Server-only por diseño: server/ no es importable desde
 * composables/ en este proyecto (ver docs/property-schema-registry.md), así
 * que el cliente lo consume vía `GET /api/admin/property-schema` en vez de
 * duplicar esta declaración — evita repetir el error ya cometido con
 * `usePropertyBuilderConfig.ts`/`usePropertyListConfig.ts`/
 * `adminResources.ts`, que hoy mantienen tres listas de campos a mano.
 *
 * `publicExposable`/`portalRelevant` son candidatos, no una autorización
 * automática (§42 del encargo): permissions, privacy (`locationPrivacy`),
 * publication state y tenant config siguen aplicando por encima. La
 * reescritura de `propertyPrivacy.ts` a una proyección explícita basada en
 * este registro es trabajo de FASE 27 (Property Search), tal y como ese
 * propio fichero ya documentaba antes de que existiera este registro — no
 * se adelanta aquí.
 */

export type PropertyCatalog = 'agent' | 'developer'

export type PropertySchemaKey = 'residential' | 'land' | 'commercial' | 'industrial' | 'garage' | 'building' | 'newDevelopment'

export interface PropertyFieldRule {
  key: string
  /** Bloquea el guardado (incluso como borrador) si falta. Se mantiene deliberadamente mínimo — una Property incompleta debe poder guardarse (§21). */
  requiredForSave?: boolean
  /** Bloquea la publicación si falta, aunque el guardado como borrador ya haya sido posible. */
  requiredForPublish?: boolean
  /** Bloquea el envío a portales (subconjunto de requiredForPublish, puede ser más estricto). */
  requiredForPortal?: boolean
  /** Candidato a aparecer en una respuesta pública — sujeto a permissions/privacy/publication state (§42). */
  publicExposable?: boolean
  /** Candidato a mapear a un feed de portal (Idealista/Fotocasa/etc. — ninguno implementado todavía, ver server/utils/publication/channels.ts). */
  portalRelevant?: boolean
}

export interface PropertySchemaSectionDef {
  key: string
  label: string
  fields: string[]
}

export interface PropertySchemaDef {
  key: PropertySchemaKey
  label: string
  /** Catálogo(s) de Property Core al que aplica este schema. 'developer' es siempre newDevelopment (ver PROPERTY_TYPE_TO_SCHEMA). */
  catalogs: PropertyCatalog[]
  sections: PropertySchemaSectionDef[]
  fields: Record<string, PropertyFieldRule>
}

function rule(key: string, over: Partial<PropertyFieldRule> = {}): PropertyFieldRule {
  return { key, publicExposable: true, portalRelevant: true, ...over }
}

/**
 * Campo que server/utils/propertyPrivacy.ts (INTERNAL_ONLY_KEYS) ya trata
 * como estrictamente interno hoy, o que nunca tiene sentido exponer
 * (identificadores de fila/relación). El registro debe coincidir con ese
 * denylist, no contradecirlo, hasta que FASE 27 lo sustituya por una
 * proyección explícita basada en este mismo registro.
 */
function internalRule(key: string, over: Partial<PropertyFieldRule> = {}): PropertyFieldRule {
  return { key, publicExposable: false, portalRelevant: false, ...over }
}

// --- Bloques de campos compartidos por Property Core (migración 0068, idéntica en ambos catálogos) ---

const IDENTIFICATION_FIELDS: PropertyFieldRule[] = [
  internalRule('reference'),
  internalRule('externalSource'),
  internalRule('externalReference'),
  internalRule('agencyReference'),
  internalRule('mandateType'),
  internalRule('exclusiveFrom'),
  internalRule('exclusiveUntil'),
  internalRule('captureDate'),
  internalRule('captureSource'),
  rule('transactionType', { requiredForPublish: true, requiredForPortal: true }),
]

const LOCATION_FIELDS: PropertyFieldRule[] = [
  rule('country', { requiredForPublish: true }),
  rule('city', { requiredForPublish: true, requiredForPortal: true }),
  rule('street'),
  rule('streetNumber'),
  rule('community'),
  rule('block'),
  rule('portal'),
  rule('floor'),
  rule('doorLetter'),
  rule('postalCode'),
  rule('district'),
  rule('lat', { requiredForPortal: true }),
  rule('lng', { requiredForPortal: true }),
  internalRule('locationPrivacy'),
  internalRule('locationPrivacyRadius'),
]

const PRICE_FIELDS: PropertyFieldRule[] = [
  rule('price', { requiredForPublish: true, requiredForPortal: true }),
  rule('priceOld'),
  rule('rentalYield'),
  rule('serviceChargeAnnual'),
]

const MEDIA_FIELDS: PropertyFieldRule[] = [
  rule('videoUrl'),
  rule('dronePhoto'),
  rule('nightPhoto'),
  rule('beforePhoto'),
  rule('afterPhoto'),
  rule('aiStagedPhoto'),
]

const CONDITION_FIELDS: PropertyFieldRule[] = [rule('condition'), rule('furnished'), rule('yearBuilt'), rule('energyRating'), rule('orientation')]

const EQUIPMENT_FIELDS: PropertyFieldRule[] = [
  rule('hasElevator'),
  rule('hasPool'),
  rule('hasGarage'),
  rule('hasTerrace'),
  rule('hasGarden'),
  rule('petsAllowed'),
  rule('accessible'),
  rule('hasTour', { publicExposable: true, portalRelevant: false }),
]

const RESIDENTIAL_SURFACE_FIELDS: PropertyFieldRule[] = [
  rule('area', { requiredForPublish: true, requiredForPortal: true }),
  rule('usableArea'),
  rule('bedrooms', { requiredForPortal: true }),
  rule('bathrooms', { requiredForPortal: true }),
  rule('toilets'),
  rule('livingRooms'),
  rule('kitchens'),
  rule('terraceArea'),
  rule('balconyArea'),
  rule('storageArea'),
  // Una villa/chalet puede tener parcela propia y/o plazas de garaje propias
  // — ambos ya son campos reales del editor de 2ª mano hoy (sección
  // Características), sin restringir a Land/Garage. Sin esto, el filtrado
  // por schema (FASE 25) los ocultaría para Residential por no estar
  // declarados aquí, aunque el editor los mostraba a todo el mundo antes de
  // que existiera el registro.
  rule('plotArea'),
  rule('garageSpaces'),
]

function sectionsFor(fieldGroups: { key: string; label: string; fields: PropertyFieldRule[] }[]): { sections: PropertySchemaSectionDef[]; fields: Record<string, PropertyFieldRule> } {
  const sections: PropertySchemaSectionDef[] = []
  const fields: Record<string, PropertyFieldRule> = {}
  for (const g of fieldGroups) {
    sections.push({ key: g.key, label: g.label, fields: g.fields.map((f) => f.key) })
    for (const f of g.fields) fields[f.key] = f
  }
  return { sections, fields }
}

const RESIDENTIAL = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  { key: 'surfaces', label: 'Superficies y distribución', fields: RESIDENTIAL_SURFACE_FIELDS },
  { key: 'condition', label: 'Estado', fields: CONDITION_FIELDS },
  { key: 'equipment', label: 'Equipamiento', fields: EQUIPMENT_FIELDS },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: MEDIA_FIELDS },
])

const LAND = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  {
    key: 'plot',
    label: 'Parcela',
    fields: [rule('plotArea', { requiredForPublish: true, requiredForPortal: true }), rule('condition')],
  },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: MEDIA_FIELDS },
])

const COMMERCIAL = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  {
    key: 'surfaces',
    label: 'Superficies',
    fields: [rule('area', { requiredForPublish: true, requiredForPortal: true }), rule('usableArea'), rule('toilets')],
  },
  { key: 'condition', label: 'Estado', fields: CONDITION_FIELDS },
  { key: 'equipment', label: 'Equipamiento', fields: EQUIPMENT_FIELDS },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: MEDIA_FIELDS },
])

const INDUSTRIAL = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  {
    key: 'surfaces',
    label: 'Superficies',
    fields: [rule('area', { requiredForPublish: true, requiredForPortal: true }), rule('plotArea'), rule('storageArea')],
  },
  { key: 'condition', label: 'Estado', fields: [rule('condition'), rule('yearBuilt')] },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: MEDIA_FIELDS },
])

const GARAGE = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  {
    key: 'surfaces',
    label: 'Superficies',
    fields: [rule('area', { requiredForPublish: true }), rule('garageSpaces', { requiredForPortal: true })],
  },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: [rule('videoUrl')] },
])

const BUILDING = sectionsFor([
  { key: 'identification', label: 'Identificación', fields: IDENTIFICATION_FIELDS },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  {
    key: 'surfaces',
    label: 'Superficies',
    fields: [rule('area', { requiredForPublish: true, requiredForPortal: true }), rule('plotArea'), rule('garageSpaces')],
  },
  { key: 'condition', label: 'Estado', fields: [rule('condition'), rule('yearBuilt'), rule('energyRating')] },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  { key: 'media', label: 'Media', fields: MEDIA_FIELDS },
])

const NEW_DEVELOPMENT = sectionsFor([
  {
    key: 'identification',
    label: 'Identificación',
    fields: [
      internalRule('reference'),
      internalRule('externalSource'),
      internalRule('externalReference'),
      internalRule('agencyReference'),
      rule('name', { requiredForSave: true, requiredForPublish: true, requiredForPortal: true }),
      // NOT requiredForSave: developer_properties.transaction_type es NOT
      // NULL DEFAULT 'sale' en la base de datos — un create que no lo envía
      // (el caso normal, confirmado por e2e real) sigue quedando con un
      // valor válido vía el default de la columna. Exigirlo aquí rompía
      // exactamente esos creates legítimos sin aportar ninguna protección
      // real (la columna nunca queda vacía de todas formas).
      rule('transactionType', { requiredForPublish: true, requiredForPortal: true }),
      internalRule('developerId', { requiredForSave: true }),
    ],
  },
  { key: 'location', label: 'Ubicación', fields: LOCATION_FIELDS },
  { key: 'surfaces', label: 'Superficies y distribución', fields: RESIDENTIAL_SURFACE_FIELDS },
  { key: 'condition', label: 'Estado', fields: CONDITION_FIELDS },
  { key: 'equipment', label: 'Equipamiento', fields: EQUIPMENT_FIELDS },
  { key: 'price', label: 'Precio', fields: PRICE_FIELDS },
  {
    key: 'construction',
    label: 'Construcción y entrega',
    fields: [
      rule('handoverDate'),
      rule('handoverPercentage'),
      rule('downPercentage'),
      rule('constructionPercentage'),
      rule('paymentPlan'),
      rule('description', { requiredForPublish: true }),
      rule('keyHighlights'),
    ],
  },
  { key: 'media', label: 'Media', fields: [...MEDIA_FIELDS, rule('logo'), rule('coverImage', { requiredForPublish: true }), rule('masterPlanImage'), rule('locationMap')] },
])

export const PROPERTY_SCHEMAS: Record<PropertySchemaKey, PropertySchemaDef> = {
  residential: { key: 'residential', label: 'Residencial', catalogs: ['agent'], ...RESIDENTIAL },
  land: { key: 'land', label: 'Suelo / Terreno', catalogs: ['agent'], ...LAND },
  commercial: { key: 'commercial', label: 'Local / Oficina', catalogs: ['agent'], ...COMMERCIAL },
  industrial: { key: 'industrial', label: 'Nave industrial', catalogs: ['agent'], ...INDUSTRIAL },
  garage: { key: 'garage', label: 'Garaje / Trastero', catalogs: ['agent'], ...GARAGE },
  building: { key: 'building', label: 'Edificio completo', catalogs: ['agent'], ...BUILDING },
  newDevelopment: { key: 'newDevelopment', label: 'Obra nueva', catalogs: ['developer'], ...NEW_DEVELOPMENT },
}

/**
 * PropertyType (valor libre en `agent_properties.property_type` /
 * `developer_properties.property_type_main`) → PropertySchemaKey (§35: no
 * son lo mismo). `developer_properties` no participa de este mapa: todo lo
 * de ese catálogo es `newDevelopment` (ver getPropertySchemaFor), porque los
 * campos que distinguen un schema del resto ahí (handoverDate,
 * constructionPercentage...) son del proyecto/promoción, no del tipo de
 * unidad — un ático y un estudio dentro de la misma promoción comparten
 * exactamente esos campos.
 */
export const AGENT_PROPERTY_TYPE_TO_SCHEMA: Record<string, PropertySchemaKey> = {
  Apartment: 'residential',
  Villa: 'residential',
  Townhouse: 'residential',
  Penthouse: 'residential',
  Studio: 'residential',
  Land: 'land',
  Office: 'commercial',
  Retail: 'commercial',
  Warehouse: 'industrial',
  Garage: 'garage',
  Building: 'building',
}

export function getPropertySchemaFor(catalog: PropertyCatalog, propertyType: string | null | undefined): PropertySchemaDef {
  if (catalog === 'developer') return PROPERTY_SCHEMAS.newDevelopment
  const key = (propertyType && AGENT_PROPERTY_TYPE_TO_SCHEMA[propertyType]) || 'residential'
  return PROPERTY_SCHEMAS[key]
}

export function getPropertySchema(key: PropertySchemaKey): PropertySchemaDef {
  return PROPERTY_SCHEMAS[key]
}

export function listPropertySchemas(): PropertySchemaDef[] {
  return Object.values(PROPERTY_SCHEMAS)
}

/** Claves de campo que este schema NO declara — la UI las trata como no-aplicables (§27, ocultarlas) sin necesidad de un `if` por campo. */
export function isFieldApplicable(schema: PropertySchemaDef, fieldKey: string): boolean {
  return fieldKey in schema.fields
}

export interface PropertySchemaValidationResult {
  ok: boolean
  missingForSave: string[]
  missingForPublish: string[]
}

/**
 * Valida un payload contra un schema. `mode: 'save'` sólo exige
 * requiredForSave (una Property incompleta debe poder guardarse, §21);
 * `mode: 'publish'` exige además requiredForPublish. Server-side siempre —
 * la validación en cliente (FASE 25) es sólo UX, ésta es la que cuenta
 * (§41: "no confiar en configuración frontend").
 */
export function validateAgainstSchema(schema: PropertySchemaDef, values: Record<string, unknown>, mode: 'save' | 'publish'): PropertySchemaValidationResult {
  const isEmpty = (v: unknown) => v === null || v === undefined || v === ''
  const missingForSave = Object.values(schema.fields)
    .filter((f) => f.requiredForSave && isEmpty(values[f.key]))
    .map((f) => f.key)
  const missingForPublish =
    mode === 'publish'
      ? Object.values(schema.fields)
          .filter((f) => f.requiredForPublish && isEmpty(values[f.key]))
          .map((f) => f.key)
      : []
  return { ok: missingForSave.length === 0 && missingForPublish.length === 0, missingForSave, missingForPublish }
}

/** Campos candidatos a exposición pública para este schema (§42 — no es autorización por sí sola, ver docstring del módulo). */
export function getPublicExposableFields(schema: PropertySchemaDef): string[] {
  return Object.values(schema.fields)
    .filter((f) => f.publicExposable)
    .map((f) => f.key)
}

/** Campos candidatos a mapear a un feed de portal (§43 — ningún portal tiene adapter implementado todavía, ver server/utils/publication/channels.ts). */
export function getPortalRelevantFields(schema: PropertySchemaDef): string[] {
  return Object.values(schema.fields)
    .filter((f) => f.portalRelevant)
    .map((f) => f.key)
}

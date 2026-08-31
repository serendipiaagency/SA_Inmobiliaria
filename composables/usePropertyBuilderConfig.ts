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
 */

export interface FieldSpec {
  key: string
  label: string
  type: 'text' | 'textarea' | 'rich-text' | 'number' | 'stepper' | 'select' | 'checkbox' | 'image' | 'url' | 'json' | 'relation' | 'agent' | 'payment-plan' | 'video'
  options?: string[]
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

export type BuilderSection = FieldsSection | LocationSection | GallerySection | ChildTableSection | SocialSection | TranslationsSection

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

const PROPERTY_TYPE_OPTIONS = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']
const ORIENTATION_OPTIONS = ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW']
const ENERGY_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

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
        { key: 'developerId', label: 'Promotora', type: 'relation', relationResource: 'developers', required: true, group: 'Clasificación' },
        { key: 'status', label: 'Estado', type: 'select', options: ['new', 'under_construction', 'ready'], group: 'Clasificación' },
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS, group: 'Clasificación' },
        { key: 'yearBuilt', label: 'Año de construcción', type: 'number', group: 'Clasificación' },
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
      ],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      description: 'Precio de salida, evolución y plan de pagos.',
      kind: 'fields',
      fields: [
        { key: 'price', label: 'Precio de salida (AED)', type: 'number', required: true, group: 'Precio principal' },
        { key: 'priceOld', label: 'Precio anterior (AED)', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.', group: 'Precio principal' },
        { key: 'handoverDate', label: 'Fecha de entrega', type: 'text', group: 'Condiciones' },
        { key: 'handoverPercentage', label: '% a la entrega', type: 'text', group: 'Condiciones' },
        { key: 'downPercentage', label: '% de entrada', type: 'text', group: 'Condiciones' },
        { key: 'constructionPercentage', label: '% durante construcción', type: 'text', group: 'Condiciones' },
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
        { key: 'bedrooms', label: 'Habitaciones', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'bathrooms', label: 'Baños', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'area', label: 'Superficie (m²)', type: 'number', recommended: true, group: 'Dimensiones' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS, group: 'Certificación' },
        { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS, group: 'Certificación' },
        { key: 'hasElevator', label: 'Ascensor', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasPool', label: 'Piscina', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarage', label: 'Garaje', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasTerrace', label: 'Terraza', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarden', label: 'Jardín', type: 'checkbox', group: 'Equipamiento' },
        { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox', group: 'Equipamiento' },
        { key: 'accessible', label: 'Accesible', type: 'checkbox', group: 'Equipamiento' },
      ],
    },
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
        { key: 'dronePhoto', label: 'Foto aérea (drone)', type: 'image', group: 'Fotografía premium' },
        { key: 'nightPhoto', label: 'Foto nocturna', type: 'image', group: 'Fotografía premium' },
        { key: 'beforePhoto', label: 'Foto "antes"', type: 'image', group: 'Fotografía premium' },
        { key: 'afterPhoto', label: 'Foto "después"', type: 'image', group: 'Fotografía premium' },
        { key: 'aiStagedPhoto', label: 'Foto con staging IA', type: 'image', group: 'Fotografía premium' },
      ],
    },
    {
      key: 'gallery',
      label: 'Galería',
      icon: 'widget',
      description: 'Fotografías del proyecto, en orden y con imagen principal.',
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
        { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox', group: 'Inversión' },
        { key: 'isReserved', label: 'Reservada', type: 'checkbox', group: 'Inversión' },
        { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox', group: 'Inversión' },
        { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number', group: 'Inversión' },
        { key: 'serviceChargeAnnual', label: 'Gastos de comunidad anuales (AED)', type: 'number', group: 'Inversión' },
      ],
    },
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
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS, recommended: true, group: 'Clasificación' },
        { key: 'transactionType', label: 'Operación', type: 'select', options: ['sale', 'rent'], recommended: true, group: 'Clasificación' },
        { key: 'status', label: 'Estado', type: 'select', options: ['available', 'sold'], group: 'Clasificación' },
        { key: 'yearBuilt', label: 'Año de construcción', type: 'number', group: 'Clasificación' },
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
        { key: 'location', label: 'Referencia de ubicación (heredado)', type: 'text', span: 2, hint: 'Campo de texto libre anterior. Se conserva por compatibilidad; usa los campos de arriba para direcciones nuevas.' },
      ],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      description: 'Precio de venta o alquiler.',
      kind: 'fields',
      fields: [
        { key: 'price', label: 'Precio (AED)', type: 'number', required: true, group: 'Precio principal' },
        { key: 'priceOld', label: 'Precio anterior (AED)', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.', group: 'Precio principal' },
        { key: 'paymentPlan', label: 'Plan de pagos', type: 'payment-plan', span: 2, group: 'Plan de pagos' },
      ],
    },
    {
      key: 'features',
      label: 'Características',
      icon: 'layers',
      description: 'Superficie, habitaciones, baños y equipamiento.',
      kind: 'fields',
      fields: [
        { key: 'area', label: 'Superficie (m²)', type: 'number', recommended: true, group: 'Dimensiones' },
        { key: 'bedrooms', label: 'Habitaciones', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'bathrooms', label: 'Baños', type: 'stepper', recommended: true, group: 'Dimensiones' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS, group: 'Certificación' },
        { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS, group: 'Certificación' },
        { key: 'hasElevator', label: 'Ascensor', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasPool', label: 'Piscina', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarage', label: 'Garaje', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasTerrace', label: 'Terraza', type: 'checkbox', group: 'Equipamiento' },
        { key: 'hasGarden', label: 'Jardín', type: 'checkbox', group: 'Equipamiento' },
        { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox', group: 'Equipamiento' },
        { key: 'accessible', label: 'Accesible', type: 'checkbox', group: 'Equipamiento' },
      ],
    },
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
        { key: 'dronePhoto', label: 'Foto aérea (drone)', type: 'image', group: 'Fotografía premium' },
        { key: 'nightPhoto', label: 'Foto nocturna', type: 'image', group: 'Fotografía premium' },
        { key: 'beforePhoto', label: 'Foto "antes"', type: 'image', group: 'Fotografía premium' },
        { key: 'afterPhoto', label: 'Foto "después"', type: 'image', group: 'Fotografía premium' },
        { key: 'aiStagedPhoto', label: 'Foto con staging IA', type: 'image', group: 'Fotografía premium' },
      ],
    },
    {
      key: 'gallery',
      label: 'Galería',
      icon: 'widget',
      description: 'Fotografías de la vivienda.',
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
        { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox', group: 'Inversión' },
        { key: 'isReserved', label: 'Reservada', type: 'checkbox', group: 'Inversión' },
        { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox', group: 'Inversión' },
        { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number', group: 'Inversión' },
        { key: 'serviceChargeAnnual', label: 'Gastos de comunidad anuales (AED)', type: 'number', group: 'Inversión' },
      ],
    },
  ],
}

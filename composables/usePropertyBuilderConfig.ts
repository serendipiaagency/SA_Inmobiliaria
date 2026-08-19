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
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'image' | 'url' | 'json' | 'relation'
  options?: string[]
  /** For type 'relation': the admin resource to fetch options from. */
  relationResource?: string
  hint?: string
  /** Grid column span out of the section's 2-col grid. */
  span?: 1 | 2
  required?: boolean
}

interface BaseSection {
  key: string
  label: string
  icon: string
}

export interface FieldsSection extends BaseSection {
  kind: 'fields'
  fields: FieldSpec[]
}

export interface GallerySection extends BaseSection {
  kind: 'gallery'
  childResource: string
  parentField: string
}

export interface ChildTableSection extends BaseSection {
  kind: 'child-table'
  childResource: string
  parentField: string
  columns: FieldSpec[]
}

export interface TranslationsSection extends BaseSection {
  kind: 'translations'
}

export type BuilderSection = FieldsSection | GallerySection | ChildTableSection | TranslationsSection

const PROPERTY_TYPE_OPTIONS = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']
const ORIENTATION_OPTIONS = ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW']
const ENERGY_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export const PROPERTY_BUILDER_SECTIONS: Record<string, BuilderSection[]> = {
  'developer-properties': [
    {
      key: 'info',
      label: 'Información básica',
      icon: 'doc',
      kind: 'fields',
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, span: 2 },
        { key: 'slug', label: 'Slug', type: 'text', hint: 'Se genera solo si lo dejas vacío.' },
        { key: 'developerId', label: 'Promotora', type: 'relation', relationResource: 'developers', required: true },
        { key: 'status', label: 'Estado', type: 'select', options: ['new', 'under_construction', 'ready'] },
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS },
        { key: 'community', label: 'Comunidad', type: 'text' },
        { key: 'yearBuilt', label: 'Año de construcción', type: 'number' },
      ],
    },
    {
      key: 'location',
      label: 'Ubicación',
      icon: 'building',
      kind: 'fields',
      fields: [
        { key: 'street', label: 'Calle', type: 'text', span: 2 },
        { key: 'postalCode', label: 'Código postal', type: 'text' },
        { key: 'lat', label: 'Latitud', type: 'number' },
        { key: 'lng', label: 'Longitud', type: 'number' },
      ],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      kind: 'fields',
      fields: [
        { key: 'price', label: 'Precio de salida (AED)', type: 'number', required: true },
        { key: 'priceOld', label: 'Precio anterior (AED)', type: 'number', hint: 'Para mostrar un precio tachado si ha bajado.' },
        { key: 'handoverDate', label: 'Fecha de entrega', type: 'text' },
        { key: 'handoverPercentage', label: '% a la entrega', type: 'text' },
        { key: 'downPercentage', label: '% de entrada', type: 'text' },
        { key: 'constructionPercentage', label: '% durante construcción', type: 'text' },
        { key: 'paymentPlan', label: 'Plan de pagos (JSON)', type: 'json', span: 2 },
      ],
    },
    {
      key: 'features',
      label: 'Características',
      icon: 'layers',
      kind: 'fields',
      fields: [
        { key: 'bedrooms', label: 'Habitaciones', type: 'number' },
        { key: 'bathrooms', label: 'Baños', type: 'number' },
        { key: 'area', label: 'Superficie (m²)', type: 'number' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: ORIENTATION_OPTIONS },
        { key: 'energyRating', label: 'Calificación energética', type: 'select', options: ENERGY_OPTIONS },
        { key: 'hasElevator', label: 'Ascensor', type: 'checkbox' },
        { key: 'hasPool', label: 'Piscina', type: 'checkbox' },
        { key: 'hasGarage', label: 'Garaje', type: 'checkbox' },
        { key: 'hasTerrace', label: 'Terraza', type: 'checkbox' },
        { key: 'hasGarden', label: 'Jardín', type: 'checkbox' },
        { key: 'petsAllowed', label: 'Se admiten mascotas', type: 'checkbox' },
        { key: 'accessible', label: 'Accesible', type: 'checkbox' },
      ],
    },
    {
      key: 'description',
      label: 'Descripción',
      icon: 'doc',
      kind: 'fields',
      fields: [
        { key: 'description', label: 'Descripción', type: 'textarea', span: 2 },
        { key: 'keyHighlights', label: 'Puntos clave', type: 'textarea', span: 2 },
        { key: 'masterPlanDescription', label: 'Descripción del master plan', type: 'textarea', span: 2 },
        { key: 'floorPlanDescription', label: 'Descripción de los planos', type: 'textarea', span: 2 },
        { key: 'locationMapDescription', label: 'Descripción del mapa de ubicación', type: 'textarea', span: 2 },
      ],
    },
    {
      key: 'media',
      label: 'Multimedia',
      icon: 'widget',
      kind: 'fields',
      fields: [
        { key: 'logo', label: 'Logo', type: 'image' },
        { key: 'coverImage', label: 'Imagen de portada', type: 'image' },
        { key: 'masterPlanImage', label: 'Imagen del master plan', type: 'image' },
        { key: 'locationMap', label: 'Mapa de ubicación', type: 'image' },
        { key: 'videoUrl', label: 'Vídeo (URL)', type: 'url', span: 2 },
        { key: 'dronePhoto', label: 'Foto aérea (drone)', type: 'image' },
        { key: 'nightPhoto', label: 'Foto nocturna', type: 'image' },
        { key: 'beforePhoto', label: 'Foto "antes"', type: 'image' },
        { key: 'afterPhoto', label: 'Foto "después"', type: 'image' },
        { key: 'aiStagedPhoto', label: 'Foto con staging IA', type: 'image' },
      ],
    },
    {
      key: 'gallery',
      label: 'Galería',
      icon: 'widget',
      kind: 'gallery',
      childResource: 'project-images',
      parentField: 'developerPropertyId',
    },
    {
      key: 'floorplans',
      label: 'Planos',
      icon: 'layers',
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
      kind: 'child-table',
      childResource: 'social-media',
      parentField: 'developerPropertyId',
      columns: [
        { key: 'platform', label: 'Plataforma', type: 'select', options: ['instagram', 'tiktok'], required: true },
        { key: 'url', label: 'URL del post/reel', type: 'text', required: true },
        { key: 'caption', label: 'Descripción', type: 'text' },
        { key: 'sortOrder', label: 'Orden', type: 'number' },
      ],
    },
    {
      key: 'commercial',
      label: 'Comercial / Inversión',
      icon: 'chart',
      kind: 'fields',
      fields: [
        { key: 'isExclusive', label: 'Exclusiva', type: 'checkbox' },
        { key: 'isReserved', label: 'Reservada', type: 'checkbox' },
        { key: 'hasTour', label: 'Tiene tour virtual', type: 'checkbox' },
        { key: 'rentalYield', label: 'Rentabilidad estimada (%)', type: 'number' },
        { key: 'serviceChargeAnnual', label: 'Gastos de comunidad anuales (AED)', type: 'number' },
      ],
    },
  ],

  properties: [
    {
      key: 'info',
      label: 'Información básica',
      icon: 'doc',
      kind: 'fields',
      fields: [
        { key: 'slug', label: 'Slug', type: 'text', span: 2 },
        { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: PROPERTY_TYPE_OPTIONS },
        { key: 'transactionType', label: 'Operación', type: 'select', options: ['sale', 'rent'] },
        { key: 'status', label: 'Estado', type: 'select', options: ['available', 'sold'] },
      ],
    },
    {
      key: 'location',
      label: 'Ubicación',
      icon: 'building',
      kind: 'fields',
      fields: [{ key: 'location', label: 'Ubicación', type: 'text', span: 2 }],
    },
    {
      key: 'price',
      label: 'Precio',
      icon: 'invoice',
      kind: 'fields',
      fields: [{ key: 'price', label: 'Precio (AED)', type: 'number', required: true }],
    },
    {
      key: 'features',
      label: 'Características',
      icon: 'layers',
      kind: 'fields',
      fields: [
        { key: 'area', label: 'Superficie (m²)', type: 'number' },
        { key: 'bedrooms', label: 'Habitaciones', type: 'number' },
        { key: 'bathrooms', label: 'Baños', type: 'number' },
      ],
    },
    {
      key: 'description',
      label: 'Descripción',
      icon: 'doc',
      kind: 'translations',
    },
    {
      key: 'media',
      label: 'Multimedia',
      icon: 'widget',
      kind: 'fields',
      fields: [{ key: 'mainImage', label: 'Imagen principal', type: 'image' }],
    },
    {
      key: 'gallery',
      label: 'Galería',
      icon: 'widget',
      kind: 'gallery',
      childResource: 'gallery-images',
      parentField: 'propertyId',
    },
  ],
}

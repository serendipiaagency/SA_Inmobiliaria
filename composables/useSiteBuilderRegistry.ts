/**
 * The Constructor Web's block catalogue — the single list that drives the
 * "+ Añadir bloque" library and the right-panel editor dispatch. A block's
 * `type` is what SiteBlockRenderer.vue and the admin editors both switch
 * on; `presetId` only exists for the add-library (several presets can
 * share one `type`, e.g. the three "properties" layouts) and is never
 * stored on the block itself.
 */
export interface BlockPreset {
  presetId: string
  type: string
  label: string
  description: string
  category: string
  createContent: () => Record<string, any>
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function newBlockId(type: string): string {
  return `${type}-${randomSuffix()}`
}

export const BLOCK_CATEGORIES = ['Principal', 'Propiedades', 'Explora', 'Herramientas', 'Contenido'] as const

export const BLOCK_PRESETS: BlockPreset[] = [
  {
    presetId: 'hero',
    type: 'hero',
    label: 'Hero',
    description: 'Cabecera a pantalla completa con imágenes, titular y buscador.',
    category: 'Principal',
    createContent: () => ({
      eyebrow: 'Real estate, elevated',
      title1: 'Espacios que',
      title2: 'merecen ser vividos.',
      subtitle: 'Una selección curada de propiedades excepcionales.',
      slides: [],
      exploreCta: 'Explorar catálogo',
      exploreCtaTo: '/demo/properties',
      advisorCta: 'Hablar con un asesor',
      advisorCtaTo: '/demo/contact-us',
    }),
  },
  {
    presetId: 'properties-row',
    type: 'properties',
    label: 'Propiedades — fila',
    description: 'Una fila de propiedades en tarjetas, con enlace "Ver todas".',
    category: 'Propiedades',
    createContent: () => ({
      eyebrow: 'Selección', title: 'Propiedades', cta: 'Ver todas', ctaTo: '/demo/properties',
      source: 'dynamic', dynamicFilter: 'latest', limit: 4, layout: 'row',
    }),
  },
  {
    presetId: 'properties-dark',
    type: 'properties',
    label: 'Propiedades — destacado oscuro',
    description: 'Sección de fondo oscuro para una colección premium.',
    category: 'Propiedades',
    createContent: () => ({
      eyebrow: 'Colección exclusiva', title: 'Propiedades Premium', cta: 'Ver todas', ctaTo: '/demo/properties?sort=price_desc',
      source: 'dynamic', dynamicFilter: 'premium', limit: 3, layout: 'dark-grid',
    }),
  },
  {
    presetId: 'properties-ai',
    type: 'properties',
    label: 'Propiedades — recomendadas (IA)',
    description: 'Cuadrícula con insignia "IA" para propiedades recomendadas.',
    category: 'Propiedades',
    createContent: () => ({
      eyebrow: 'Recomendado para ti', title: 'La IA selecciona por rentabilidad y valor', cta: '', ctaTo: '',
      source: 'dynamic', dynamicFilter: 'recommended', limit: 4, layout: 'ai-grid', badge: 'IA',
    }),
  },
  {
    presetId: 'map-teaser',
    type: 'map-teaser',
    label: 'Mapa (teaser)',
    description: 'Bloque de dos columnas con texto y un mapa ilustrativo.',
    category: 'Explora',
    createContent: () => ({
      eyebrow: 'Explora por zona', title: 'Encuentra tu barrio en el mapa',
      text: 'Descubre las propiedades por ubicación, con transporte, colegios y servicios a un vistazo.',
      cta: 'Abrir el mapa', ctaTo: '/demo/properties', pins: [],
    }),
  },
  {
    presetId: 'communities',
    type: 'communities',
    label: 'Comunidades',
    description: 'Cuadrícula de comunidades/barrios con imagen de portada.',
    category: 'Explora',
    createContent: () => ({ eyebrow: 'Vive aquí', title: 'Barrios destacados', source: 'dynamic', limit: 6 }),
  },
  {
    presetId: 'property-types',
    type: 'property-types',
    label: 'Tipos de propiedad',
    description: 'Rejilla de enlaces por tipo de propiedad (se genera sola a partir de tus propiedades).',
    category: 'Explora',
    createContent: () => ({ eyebrow: 'Por tipo de propiedad', title: 'Explora por tipo de vivienda', source: 'dynamic' }),
  },
  {
    presetId: 'mortgage-calculator',
    type: 'mortgage-calculator',
    label: 'Calculadora de hipoteca',
    description: 'Herramienta interactiva de cálculo de cuota mensual.',
    category: 'Herramientas',
    createContent: () => ({ eyebrow: 'Planifica', title: 'Calcula tu hipoteca', text: 'Estima tu cuota mensual y los costes de compra en segundos.' }),
  },
  {
    presetId: 'blog-list',
    type: 'blog-list',
    label: 'Últimos artículos',
    description: 'Últimos artículos del blog en tarjetas.',
    category: 'Contenido',
    createContent: () => ({ eyebrow: 'Journal', title: 'Ideas e historias', cta: 'Todos los artículos', ctaTo: '/demo/blog', source: 'dynamic', limit: 3 }),
  },
]

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  hero: 'Hero',
  properties: 'Propiedades',
  'map-teaser': 'Mapa (teaser)',
  communities: 'Comunidades',
  'property-types': 'Tipos de propiedad',
  'mortgage-calculator': 'Calculadora de hipoteca',
  'blog-list': 'Últimos artículos',
}

export function blockLabel(type: string): string {
  return BLOCK_TYPE_LABELS[type] || type
}

import HeroInspector from '~/components/site-builder/inspectors/HeroInspector.vue'
import PropertiesInspector from '~/components/site-builder/inspectors/PropertiesInspector.vue'
import MapTeaserInspector from '~/components/site-builder/inspectors/MapTeaserInspector.vue'
import CommunitiesInspector from '~/components/site-builder/inspectors/CommunitiesInspector.vue'
import ZonesGridInspector from '~/components/site-builder/inspectors/ZonesGridInspector.vue'
import PropertyTypesInspector from '~/components/site-builder/inspectors/PropertyTypesInspector.vue'
import MortgageInspector from '~/components/site-builder/inspectors/MortgageInspector.vue'
import BlogListInspector from '~/components/site-builder/inspectors/BlogListInspector.vue'
import TextInspector from '~/components/site-builder/inspectors/TextInspector.vue'
import CtaInspector from '~/components/site-builder/inspectors/CtaInspector.vue'
import TeamInspector from '~/components/site-builder/inspectors/TeamInspector.vue'
import AboutAgencyInspector from '~/components/site-builder/inspectors/AboutAgencyInspector.vue'
import TrustPointsInspector from '~/components/site-builder/inspectors/TrustPointsInspector.vue'
import ServicesInspector from '~/components/site-builder/inspectors/ServicesInspector.vue'
import EditorialInspector from '~/components/site-builder/inspectors/EditorialInspector.vue'
import OfficesInspector from '~/components/site-builder/inspectors/OfficesInspector.vue'
import LeadFormInspector from '~/components/site-builder/inspectors/LeadFormInspector.vue'
import SellerValuationInspector from '~/components/site-builder/inspectors/SellerValuationInspector.vue'
import BookVisitInspector from '~/components/site-builder/inspectors/BookVisitInspector.vue'
import PageCoreInspector from '~/components/site-builder/inspectors/PageCoreInspector.vue'
import EnergyEfficiencyInspector from '~/components/site-builder/inspectors/EnergyEfficiencyInspector.vue'
import { PAGE_CORE_LABELS, PAGE_CORE_TYPE, type PageCoreKind } from '~/utils/siteBuilder/pages'

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
  /** Sólo en estas páginas (utils/siteBuilder/pages.ts); sin la lista, en todas. */
  pages?: string[]
  createContent: () => Record<string, any>
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function newBlockId(type: string): string {
  return `${type}-${randomSuffix()}`
}

export const BLOCK_CATEGORIES = ['Principal', 'Propiedades', 'Explora', 'Empresa', 'Equipo', 'Captación', 'Herramientas', 'Contenido'] as const

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
    }),
  },
  {
    presetId: 'properties-row',
    type: 'properties',
    label: 'Propiedades — fila',
    description: 'Una fila de propiedades en tarjetas, con enlace "Ver todas".',
    category: 'Propiedades',
    createContent: () => ({
      eyebrow: 'Selección', title: 'Propiedades', cta: 'Ver todas', ctaTo: '/propiedades',
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
      eyebrow: 'Colección exclusiva', title: 'Propiedades Premium', cta: 'Ver todas', ctaTo: '/propiedades?sort=price_desc',
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
    description: 'Bloque de dos columnas con texto y un mapa real, con las propiedades que elijas.',
    category: 'Explora',
    createContent: () => ({
      eyebrow: 'Explora por zona', title: 'Encuentra tu barrio en el mapa',
      text: 'Descubre las propiedades por ubicación, con transporte, colegios y servicios a un vistazo.',
      cta: 'Abrir el mapa', ctaTo: '/propiedades',
      source: 'dynamic', dynamicFilter: 'latest', limit: 6,
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
    presetId: 'zones-grid',
    type: 'zones-grid',
    label: 'Zonas',
    description: 'Bloques fotográficos de las zonas donde trabajas (municipios y barrios con guía), enlazados a su guía.',
    category: 'Explora',
    createContent: () => ({ eyebrow: 'Zonas', title: 'Descubre dónde vivir', text: 'Ciudades, villas y barrios donde trabajamos, con sus viviendas disponibles.', limit: 6, cta: 'Explorar todas las zonas →', ctaTo: '/zonas' }),
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
    presetId: 'energy-efficiency',
    type: 'energy-efficiency',
    label: 'Eficiencia energética',
    description: 'La etiqueta A–G con la clasificación, el consumo y las emisiones reales de cada propiedad. Sin certificado, no sale.',
    category: 'Propiedades',
    pages: ['ficha-propiedad'],
    createContent: () => ({}),
  },
  {
    presetId: 'mortgage-calculator',
    type: 'mortgage-calculator',
    label: 'Calculadora de hipoteca',
    description: 'Herramienta interactiva de cálculo de cuota mensual.',
    category: 'Herramientas',
    createContent: () => ({ eyebrow: 'Planifica', title: 'Calcula tu hipoteca', text: 'Estima tu cuota mensual y los costes de compra en segundos.' }),
  },
  // Bloques corporativos (docs/home-corporativa.md): la inmobiliaria detrás del catálogo.
  {
    presetId: 'about-agency',
    type: 'about-agency',
    label: 'Sobre nosotros',
    description: 'La agencia detrás del catálogo: fotografía corporativa, texto, botón a «Nosotros» y cifras reales de tu cuenta (nunca inventadas).',
    category: 'Empresa',
    createContent: () => ({
      eyebrow: 'Sobre nosotros', title: 'Mucho más que encontrar una casa.',
      text: 'Somos una inmobiliaria especializada en nuestra zona. Conocemos su territorio, sus personas y sus oportunidades, y te acompañamos en todo el proceso para que encuentres un lugar donde realmente quieras vivir.',
      cta: 'Conoce nuestra inmobiliaria', ctaTo: '/nosotros', image: '', imageAlt: '',
      stats: ['team', 'offices', 'properties'],
    }),
  },
  {
    presetId: 'trust-points',
    type: 'trust-points',
    label: 'Por qué elegirnos',
    description: 'Tres o cuatro ventajas propias de tu agencia, en una rejilla 2×2 con icono y numeración y una fotografía opcional de recorte orgánico. Sin frases genéricas: lo que de verdad te distingue.',
    category: 'Empresa',
    createContent: () => ({
      eyebrow: 'Por qué elegirnos', title: 'Experiencia local. Tu tranquilidad.', text: '', image: '', imageAlt: '', count: 4,
      point1Icon: 'street', point1Title: 'Conocemos la zona', point1Text: 'Asesoramiento basado en el conocimiento real del territorio y de sus particularidades.',
      point2Icon: 'concierge', point2Title: 'Atención personal', point2Text: 'Un profesional que te acompaña en cada paso, con un trato cercano y transparente.',
      point3Icon: 'community', point3Title: 'Todo en un solo lugar', point3Text: 'Compra, venta, alquiler y asesoramiento financiero, de la mano de un mismo equipo.',
      point4Icon: 'status', point4Title: 'Tu confianza es lo primero', point4Text: 'Información clara y honesta para que tomes decisiones con seguridad.',
    }),
  },
  {
    presetId: 'services',
    type: 'services',
    label: 'Servicios',
    description: 'Lo que hace tu agencia por quien la visita: hasta seis servicios con icono, en una composición editorial a dos columnas con fotografía de recorte orgánico.',
    category: 'Empresa',
    pages: ['servicios'],
    createContent: () => ({
      eyebrow: 'Servicios', title: 'Todo lo que hacemos por ti.',
      text: 'Te acompañamos en cada paso, desde la primera visita hasta la firma, con un equipo que conoce de verdad tu zona.',
      image: '', imageAlt: '',
      service1Icon: 'propertyType', service1Title: 'Compra de vivienda', service1Text: 'Encontramos la casa que buscas y te guiamos en la negociación y la firma.',
      service2Icon: 'area', service2Title: 'Venta y valoración', service2Text: 'Ponemos precio a tu propiedad con datos reales del mercado y la presentamos para vender mejor.',
      service3Icon: 'building', service3Title: 'Alquiler', service3Text: 'Gestionamos el alquiler de principio a fin, con inquilinos solventes y contratos claros.',
      service4Icon: 'concierge', service4Title: 'Asesoramiento personal', service4Text: 'Un profesional de referencia que resuelve tus dudas y defiende tus intereses.',
      service5Icon: 'renovation', service5Title: 'Reformas y proyectos', service5Text: 'Te ayudamos a sacar el máximo partido a tu inmueble antes de venderlo o habitarlo.',
      service6Icon: 'energyRating', service6Title: 'Trámites y certificados', service6Text: 'Nos ocupamos de la documentación, el certificado energético y la gestión con notaría.',
    }),
  },
  {
    presetId: 'editorial-presentation',
    type: 'editorial',
    label: 'Imagen y texto',
    description: 'Una fotografía grande junto a un titular serif y tu texto, con cita y botón opcionales. La pieza editorial reutilizable: presentación, historia, compromiso… Imagen a izquierda, a derecha, apilada o sólo texto.',
    category: 'Empresa',
    createContent: () => ({
      layout: 'imageRight',
      imageRatio: 'portrait',
      eyebrow: 'Quiénes somos',
      title: 'Mucho más que encontrar una casa.',
      text: 'Somos una inmobiliaria especializada en nuestra zona. Conocemos su territorio, sus personas y sus oportunidades, y acompañamos a cada cliente en todo el proceso para que encuentre un lugar donde de verdad quiera vivir.\n\nNuestro equipo trabaja con cercanía, transparencia y un conocimiento real del mercado, antes, durante y después de cada operación.',
      image: '', imageAlt: '', caption: '',
      quote: '', quoteAuthor: '',
      ctaLabel: '', ctaTo: '',
    }),
  },
  {
    presetId: 'editorial-history',
    type: 'editorial',
    label: 'Nuestra historia',
    description: 'Vuestra trayectoria contada con una fotografía a todo el ancho con pie, titular serif, texto y una cita destacada. Pensado para «Nuestra historia» y secciones narrativas.',
    category: 'Empresa',
    createContent: () => ({
      layout: 'stacked',
      imageRatio: 'wide',
      eyebrow: 'Nuestra historia',
      title: 'Una trayectoria dedicada a tu zona.',
      text: 'Desde nuestros inicios, hemos crecido junto a las personas y los lugares que conocemos. Cada operación nos ha enseñado algo, y ese recorrido es hoy nuestra mejor garantía.\n\nEdita este texto con los hitos reales de tu agencia: el año de fundación, cómo empezasteis, vuestra evolución y dónde estáis hoy.',
      image: '', imageAlt: '', caption: 'Una imagen que cuente vuestra historia.',
      quote: 'Poco a poco hemos ido formando el mejor equipo, y ese es el factor clave de nuestro éxito.',
      quoteAuthor: 'Dirección',
      ctaLabel: '', ctaTo: '',
    }),
  },
  {
    presetId: 'offices',
    type: 'offices',
    label: 'Nuestras oficinas',
    description: 'Tus oficinas reales con foto, dirección, horario, teléfono y mapa: composición editorial con una, cuadrícula adaptable con varias.',
    category: 'Empresa',
    createContent: () => ({
      eyebrow: 'Nuestras oficinas', title: 'Un equipo cercano, estés donde estés.',
      text: 'Visítanos en nuestras oficinas o contáctanos. Estaremos encantados de atenderte personalmente.',
      cta: 'Ver todas las oficinas', ctaTo: '/oficinas', source: 'dynamic', limit: 6, layout: 'auto',
    }),
  },
  {
    presetId: 'team-cards',
    type: 'team',
    label: 'Nuestro Equipo — tarjetas',
    description: 'Retratos del equipo con nombre y puesto, enlazando a su ficha pública.',
    category: 'Equipo',
    createContent: () => ({
      eyebrow: 'Quiénes te acompañan', title: 'Habla con un comercial', cta: 'Ver todo el equipo', ctaTo: '/equipo',
      source: 'dynamic', limit: 4, layout: 'cards',
    }),
  },
  {
    presetId: 'team-compact',
    type: 'team',
    label: 'Nuestro Equipo — compacto',
    description: 'Fila de retratos redondos con puesto y teléfono, como prueba de confianza.',
    category: 'Equipo',
    createContent: () => ({
      eyebrow: 'Tu equipo', title: 'Personas, no formularios', cta: '', ctaTo: '',
      source: 'dynamic', limit: 3, layout: 'compact', cardFields: { position: true, contact: true },
    }),
  },
  {
    presetId: 'lead-form',
    type: 'lead-form',
    label: 'Formulario de captación',
    description: 'Formulario que crea un lead real en tu CRM, con aviso interno por email.',
    category: 'Captación',
    createContent: () => ({
      eyebrow: '¿Buscas algo concreto?',
      title: 'Cuéntanos qué necesitas',
      description: 'Déjanos tus datos y un comercial te llama con opciones reales, no con un catálogo genérico.',
      submitLabel: 'Quiero que me llamen',
      messageLabel: '¿Qué estás buscando?',
      messagePlaceholder: 'Zona, presupuesto, número de habitaciones…',
      successMessage: '¡Gracias! Te contactamos enseguida.',
      subject: 'Formulario de portada',
      privacyNote: '',
      showPhone: true,
      layout: 'split',
    }),
  },
  {
    presetId: 'seller-valuation',
    type: 'seller-valuation',
    label: 'Formulario de valoración de propiedad',
    description: 'Formulario por pasos para propietarios que quieren vender: tipo, ubicación, superficie, características y contacto. Crea un lead real de captación en tu CRM.',
    category: 'Captación',
    pages: ['vender'],
    createContent: () => ({
      eyebrow: 'Valoración sin compromiso',
      title: 'Cuéntanos qué quieres vender',
      description: 'Responde unas preguntas sobre tu propiedad y un comercial te contactará para hablar de ella.',
      submitLabel: 'Enviar mi propiedad',
      successMessage: 'Hemos recibido los datos de tu propiedad',
      subject: 'Vender propiedad',
      privacyNote: '',
    }),
  },
  {
    presetId: 'book-visit',
    type: 'book-visit',
    label: 'Reserva de visita',
    description: 'Botón que abre la agenda real de un comercial y reserva una cita.',
    category: 'Captación',
    createContent: () => ({
      eyebrow: 'Sin llamadas ni esperas',
      title: 'Reserva una visita cuando te venga bien',
      description: 'Elige el hueco que prefieras en la agenda de nuestro equipo. Te confirmamos al instante.',
      ctaLabel: 'Reservar una visita',
      agentId: null,
      channel: 'in_person',
      layout: 'split',
    }),
  },
  {
    presetId: 'blog-list',
    type: 'blog-list',
    label: 'Últimos artículos',
    description: 'Últimos artículos del blog en tarjetas.',
    category: 'Contenido',
    createContent: () => ({ eyebrow: 'Journal', title: 'Ideas e historias', cta: 'Todos los artículos', ctaTo: '/blog', source: 'dynamic', limit: 3 }),
  },
  {
    presetId: 'text',
    type: 'text',
    label: 'Texto',
    description: 'Bloque de texto libre: eyebrow, título, subtítulo y cuerpo.',
    category: 'Contenido',
    createContent: () => ({ eyebrow: '', title: 'Un título para esta sección', subtitle: '', body: 'Escribe aquí el contenido de este bloque.', align: 'left', maxWidth: 'md', columns: 1 }),
  },
  {
    presetId: 'cta',
    type: 'cta',
    label: 'Llamada a la acción',
    description: 'Sección de cierre con título, descripción y hasta dos botones.',
    category: 'Contenido',
    createContent: () => ({ eyebrow: '', title: '¿Hablamos de tu próxima propiedad?', description: '', ctaPrimary: 'Contactar', ctaPrimaryTo: '/contacto', ctaSecondary: '', ctaSecondaryTo: '', align: 'center' }),
  },
]

/** Lo que la biblioteca ofrece en una página: las secciones de todas y las propias de esa página. */
export function presetsForPage(pageKey: string): BlockPreset[] {
  return BLOCK_PRESETS.filter((p) => !p.pages || p.pages.includes(pageKey))
}

// Curated shortlist for the library's "Recomendados" shelf — the presets
// most home pages actually start from. Deliberately small: a shelf that
// just repeats the full catalogue isn't a recommendation.
export const RECOMMENDED_PRESET_IDS = ['hero', 'properties-row', 'map-teaser', 'lead-form', 'cta']

// Sparse on purpose (spec: "utilizarlos con moderación") — only where the
// badge tells the admin something the label/description doesn't already.
export const PRESET_BADGES: Record<string, string> = {
  hero: 'Popular',
  'properties-ai': 'IA',
  'lead-form': 'Conversión',
  'seller-valuation': 'Captación',
  'book-visit': 'Conversión',
  'properties-dark': 'Premium',
  cta: 'Conversión',
}

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  hero: 'Hero',
  properties: 'Propiedades',
  'map-teaser': 'Mapa (teaser)',
  communities: 'Comunidades',
  'zones-grid': 'Zonas',
  'property-types': 'Tipos de propiedad',
  'mortgage-calculator': 'Calculadora de hipoteca',
  'energy-efficiency': 'Eficiencia energética',
  'blog-list': 'Últimos artículos',
  'about-agency': 'Sobre nosotros',
  'trust-points': 'Por qué elegirnos',
  services: 'Servicios',
  editorial: 'Imagen y texto',
  offices: 'Oficinas',
  team: 'Nuestro Equipo',
  'lead-form': 'Formulario de captación',
  'seller-valuation': 'Valoración de propiedad',
  'book-visit': 'Reserva de visita',
  text: 'Texto',
  cta: 'Llamada a la acción',
}

export function blockLabel(type: string): string {
  // La zona dinámica de una página (utils/siteBuilder/pages.ts) no es un
  // bloque de la biblioteca —no se añade, viene con la página— y por eso no
  // está en BLOCK_TYPE_LABELS, que es la lista de lo que se puede añadir.
  if (type === PAGE_CORE_TYPE) return 'Zona dinámica'
  return BLOCK_TYPE_LABELS[type] || type
}

/**
 * El nombre de un bloque concreto en el editor. La zona dinámica de la ficha
 * es la propia ficha de propiedad (un bloque editable, no «una zona»): se
 * llama así; la de las demás páginas sigue siendo «Zona dinámica».
 */
export function blockLabelOf(block: { type: string; content?: Record<string, any> }): string {
  if (block.type === PAGE_CORE_TYPE && block.content?.core === 'property-detail') return 'Ficha de propiedad'
  return blockLabel(block.type)
}

const PROPERTIES_LAYOUT_LABELS: Record<string, string> = {
  row: 'Fila',
  'dark-grid': 'Oscuro',
  'ai-grid': 'IA',
}

/**
 * A short, content-aware second line for the structure panel's cards — the
 * whole reason those are cards and not a flat "Propiedades / Propiedades /
 * Propiedades" list: it's the only thing that tells two blocks of the same
 * type apart at a glance.
 */
export function blockSubtitle(block: { type: string; content?: Record<string, any> }): string {
  const c = block.content || {}
  switch (block.type) {
    case 'hero':
      return 'Hero con buscador'
    case 'properties': {
      const count = c.source === 'manual' ? (c.manualIds?.length ?? 0) : (c.limit ?? 0)
      const layout = PROPERTIES_LAYOUT_LABELS[c.layout] || 'Cuadrícula'
      return `${count} propiedad${count === 1 ? '' : 'es'} · ${layout}`
    }
    case 'map-teaser':
      return 'Mapa teaser'
    case 'communities': {
      const count = c.source === 'manual' ? (c.manualIds?.length ?? 0) : (c.limit ?? 0)
      return `${count} comunidad${count === 1 ? '' : 'es'}`
    }
    case 'zones-grid':
      return `${c.limit ?? 6} zonas con guía`
    case 'property-types':
      return 'Se genera desde tus propiedades'
    case 'mortgage-calculator':
      return 'Calculadora interactiva'
    case 'energy-efficiency':
      return 'Datos de cada propiedad'
    case 'blog-list':
      return `${c.limit ?? 0} artículo${c.limit === 1 ? '' : 's'}`
    case 'lead-form':
      return c.subject ? `Lead → "${c.subject}"` : 'Crea un lead en el CRM'
    case 'seller-valuation':
      return 'Lead de captación · 6 pasos'
    case 'book-visit': {
      const channel = c.channel === 'video' ? 'Videollamada' : c.channel === 'phone' ? 'Llamada' : 'Presencial'
      return `Agenda real · ${channel}`
    }
    case 'team': {
      const count = c.source === 'manual' ? (c.manualIds?.length ?? 0) : (c.limit ?? 0)
      return `${count} comercial${count === 1 ? '' : 'es'} · ${c.layout === 'compact' ? 'Compacto' : c.layout === 'editorial' ? 'Editorial' : 'Tarjetas'}`
    }
    case 'about-agency': {
      const stats = Array.isArray(c.stats) ? c.stats.length : 0
      return stats ? `${stats} cifra${stats === 1 ? '' : 's'} real${stats === 1 ? '' : 'es'} · foto` : 'Texto y foto, sin cifras'
    }
    case 'trust-points':
      return `${Number(c.count) === 3 ? 3 : 4} ventajas${c.image ? ' · foto' : ''}`
    case 'services': {
      const n = [1, 2, 3, 4, 5, 6].filter((i) => String(c[`service${i}Title`] || '').trim()).length
      return `${n} servicio${n === 1 ? '' : 's'}${c.image ? ' · foto' : ''}`
    }
    case 'offices': {
      const count = c.source === 'manual' ? (c.manualIds?.length ?? 0) : (c.limit ?? 0)
      const layout = c.layout === 'editorial' ? 'Editorial' : c.layout === 'grid' ? 'Cuadrícula' : 'Automático'
      return `${count} oficina${count === 1 ? '' : 's'} · ${layout}`
    }
    case 'editorial': {
      const layout = c.layout === 'stacked' ? 'Apilado' : c.layout === 'textOnly' ? 'Sólo texto' : c.layout === 'imageLeft' ? 'Imagen izq.' : 'Imagen der.'
      return `${c.title ? `"${String(c.title).slice(0, 28)}"` : 'Imagen y texto'} · ${layout}`
    }
    case 'text':
      return c.title || 'Bloque de texto libre'
    case 'cta':
      return c.ctaPrimary ? `Botón: "${c.ctaPrimary}"` : 'Llamada a la acción'
    case PAGE_CORE_TYPE:
      return `${PAGE_CORE_LABELS[c.core as PageCoreKind] || 'Contenido de la página'} · se rellena solo`
    default:
      return ''
  }
}

/**
 * The Block Inspector registry — each block `type` maps to its own inspector
 * component (components/site-builder/inspectors/*.vue), never to one shared
 * field list with conditionals. Adding a new block type later means adding
 * one entry here plus its own component; nothing else in the builder shell
 * needs to change. Some inspectors need live catalogue data (projects/
 * communities) for their "Datos" section — `needsPreviewData` marks those so
 * the shell only fetches it once, lazily, and only when actually used.
 */
export interface BlockInspectorEntry {
  component: any
  needsPreviewData?: boolean
}

export const BLOCK_INSPECTORS: Record<string, BlockInspectorEntry> = {
  hero: { component: HeroInspector },
  properties: { component: PropertiesInspector, needsPreviewData: true },
  'map-teaser': { component: MapTeaserInspector, needsPreviewData: true },
  communities: { component: CommunitiesInspector, needsPreviewData: true },
  'zones-grid': { component: ZonesGridInspector },
  'property-types': { component: PropertyTypesInspector },
  'mortgage-calculator': { component: MortgageInspector },
  'energy-efficiency': { component: EnergyEfficiencyInspector },
  'blog-list': { component: BlogListInspector },
  'about-agency': { component: AboutAgencyInspector, needsPreviewData: true },
  'trust-points': { component: TrustPointsInspector },
  services: { component: ServicesInspector },
  editorial: { component: EditorialInspector },
  offices: { component: OfficesInspector, needsPreviewData: true },
  team: { component: TeamInspector, needsPreviewData: true },
  'lead-form': { component: LeadFormInspector },
  'seller-valuation': { component: SellerValuationInspector },
  'book-visit': { component: BookVisitInspector, needsPreviewData: true },
  text: { component: TextInspector },
  cta: { component: CtaInspector },
  [PAGE_CORE_TYPE]: { component: PageCoreInspector },
}

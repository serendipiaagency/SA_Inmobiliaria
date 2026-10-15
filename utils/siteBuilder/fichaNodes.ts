import { FICHA_SECTIONS } from './pages'
import type { NodeKind } from './nodes'

/**
 * La ficha de propiedad editable (Constructor Web › «Ficha de propiedad»):
 * qué partes de la ficha son **nodos** —se pueden seleccionar en el lienzo y
 * en el árbol, y se estilizan por escritorio, tableta y móvil con el mismo
 * sistema que el resto de bloques (utils/siteBuilder/nodes.ts)— y cuáles de
 * sus textos son estáticos y se pueden reescribir.
 *
 * Tres papeles, y sólo uno guarda texto:
 *
 * - `block`: el contenedor de una parte de la ficha (la galería, la tarjeta
 *   principal, cada sección, el precio…). Se le cambia el fondo, el borde,
 *   las esquinas y el espaciado, y se ordena u oculta con la lista de
 *   secciones (`sections`) cuando es una de ellas. Nunca guarda datos.
 * - `text`: un texto fijo de la plantilla (el título de una sección, la
 *   etiqueta «Descripción»). Su contenido de partida es el que ya enseña la
 *   web; si se reescribe, la plantilla guarda el texto nuevo en `content`
 *   bajo la clave del nodo. Es el único papel que guarda texto, y sólo texto
 *   propio de la plantilla, nunca un dato de la propiedad.
 * - `data`: un dato que viene de Propiedades (el nombre, la ubicación, el
 *   precio…). Se cambia cómo se ve —tipografía, color, tamaño, alineación—,
 *   nunca el dato: no se puede escribir encima.
 *
 * Este registro es la única fuente de verdad: lo usan la ficha pública y el
 * lienzo para marcar sus elementos, el árbol de «Estructura», el inspector y
 * el servidor, que sólo guarda estilos y textos de los nodos que figuran aquí.
 */

export type FichaNodeRole = 'block' | 'text' | 'data'

export interface FichaNodeDef {
  /** Clave del nodo (`block.nodeStyles[field]`; si es texto, también `block.content[field]`). */
  field: string
  role: FichaNodeRole
  kind: NodeKind
  label: string
  /** Para `block`: la clave de FICHA_SECTIONS si es una sección que se ordena u oculta desde la lista de secciones. */
  section?: string
  /** El bloque que lo contiene, para el árbol. Sin `parent`, cuelga de la zona. */
  parent?: string
  /** Para `data`: de dónde viene ("Propiedades → Nombre"). */
  dynamic?: string
  /** Para `text`: el texto que enseña la web sin personalizar (el de la traducción en español). */
  defaultText?: string
  /** Para `data`: el panel donde se administra el dato. */
  sourceHref?: string
}

const PROPS = '/admin/developer-properties'

/** Los bloques de primer nivel de la ficha, en el orden en que se enseñan por defecto. */
const FIXED_BLOCKS: FichaNodeDef[] = [
  { field: 'b.breadcrumbs', role: 'block', kind: 'box', label: 'Migas y acciones' },
  { field: 'b.gallery', role: 'block', kind: 'box', label: 'Galería' },
  { field: 'b.summary', role: 'block', kind: 'card', label: 'Tarjeta principal' },
  { field: 'b.nav', role: 'block', kind: 'box', label: 'Barra de apartados' },
]

/** Lo que cuelga de la tarjeta principal. */
const SUMMARY_CHILDREN: FichaNodeDef[] = [
  { field: 'd.status', role: 'data', kind: 'eyebrow', label: 'Estado', parent: 'b.summary', dynamic: 'Propiedades → Estado', sourceHref: PROPS },
  { field: 'd.title', role: 'data', kind: 'heading', label: 'Título de la propiedad', parent: 'b.summary', dynamic: 'Propiedades → Nombre', sourceHref: PROPS },
  { field: 'd.location', role: 'data', kind: 'text', label: 'Ubicación', parent: 'b.summary', dynamic: 'Propiedades → Ubicación', sourceHref: PROPS },
  { field: 'b.description', role: 'block', kind: 'box', label: 'Descripción', parent: 'b.summary' },
  { field: 't.description.title', role: 'text', kind: 'caption', label: 'Título de la descripción', parent: 'b.description', defaultText: 'Descripción' },
  { field: 'd.description', role: 'data', kind: 'text', label: 'Texto de la descripción', parent: 'b.description', dynamic: 'Propiedades → Descripción', sourceHref: PROPS },
  { field: 'b.highlights', role: 'block', kind: 'card', label: 'Puntos destacados', parent: 'b.summary' },
  { field: 'b.keyfacts', role: 'block', kind: 'box', label: 'Datos clave', parent: 'b.summary' },
]

/** Las secciones que se ordenan y se ocultan (FICHA_SECTIONS) y los títulos fijos de las que tienen tarjeta con título. */
const SECTION_TITLES: Record<string, { field: string; label: string; defaultText: string }> = {
  comodidades: { field: 't.comodidades.title', label: 'Título de «Comodidades»', defaultText: 'Comodidades' },
  'mas-informacion': { field: 't.mas-informacion.title', label: 'Título de «Más información»', defaultText: 'Más información' },
  tipologias: { field: 't.tipologias.title', label: 'Título de «Tipologías»', defaultText: 'Tipologías disponibles' },
  resumen: { field: 't.resumen.title', label: 'Título de «Lo que debes saber»', defaultText: 'Lo que debes saber' },
  analisis: { field: 't.analisis.title', label: 'Título de «Análisis de inversión»', defaultText: 'Análisis de inversión' },
  precio: { field: 't.precio.title', label: 'Título de «Evolución de precio»', defaultText: 'Evolución de precio' },
  servicios: { field: 't.servicios.title', label: 'Título de «Estilo de vida»', defaultText: 'Estilo de vida' },
  ubicacion: { field: 't.ubicacion.title', label: 'Título de «Ubicación»', defaultText: 'Dónde está' },
  orientacion: { field: 't.orientacion.title', label: 'Título de «Sol y orientación»', defaultText: 'Sol y orientación' },
  hipoteca: { field: 't.hipoteca.title', label: 'Título de «Hipoteca y costes»', defaultText: 'Hipoteca y costes' },
  staging: { field: 't.staging.title', label: 'Título de «Visualiza el potencial»', defaultText: 'Visualiza el potencial' },
  historia: { field: 't.historia.title', label: 'Título de «Historia del inmueble»', defaultText: 'Historia del inmueble' },
}

const SECTION_BLOCKS: FichaNodeDef[] = FICHA_SECTIONS.flatMap((s) => {
  const block: FichaNodeDef = { field: `s.${s.key}`, role: 'block', kind: 'card', label: s.label, section: s.key }
  const title = SECTION_TITLES[s.key]
  return title ? [block, { field: title.field, role: 'text' as const, kind: 'heading' as const, label: title.label, parent: block.field, defaultText: title.defaultText }] : [block]
})

/** La columna lateral: precio, «Atendido por» y lo que va debajo. */
const ASIDE_BLOCKS: FichaNodeDef[] = [
  { field: 'b.price', role: 'block', kind: 'card', label: 'Precio y próxima visita' },
  { field: 'b.contact', role: 'block', kind: 'card', label: 'Atendido por' },
  { field: 't.contact.eyebrow', role: 'text', kind: 'eyebrow', label: 'Etiqueta «Atendido por»', parent: 'b.contact', defaultText: 'Atendido por' },
  { field: 't.contact.title', role: 'text', kind: 'heading', label: 'Título del formulario', parent: 'b.contact', defaultText: 'Cuéntanos qué necesitas' },
  { field: 't.contact.lead', role: 'text', kind: 'text', label: 'Texto del formulario', parent: 'b.contact', defaultText: 'Te ayudamos con los detalles de esta propiedad.' },
  { field: 't.contact.submit', role: 'text', kind: 'button', label: 'Botón de envío', parent: 'b.contact', defaultText: 'Enviar mensaje' },
  { field: 'b.listing-meta', role: 'block', kind: 'card', label: 'Última actualización y referencia' },
  { field: 'b.indicators', role: 'block', kind: 'card', label: 'Indicadores' },
  { field: 'b.quick-decision', role: 'block', kind: 'card', label: 'Decisión rápida' },
  { field: 'b.developer', role: 'block', kind: 'card', label: 'Promotora' },
  { field: 'b.similar', role: 'block', kind: 'card', label: 'Propiedades similares' },
  { field: 't.similar.title', role: 'text', kind: 'heading', label: 'Título de «Propiedades similares»', parent: 'b.similar', defaultText: 'Propiedades similares' },
]

export const FICHA_NODES: FichaNodeDef[] = [...FIXED_BLOCKS, ...SUMMARY_CHILDREN, ...SECTION_BLOCKS, ...ASIDE_BLOCKS]

const BY_FIELD = new Map(FICHA_NODES.map((n) => [n.field, n]))

export function fichaNode(field: string): FichaNodeDef | undefined {
  return BY_FIELD.get(field)
}

/**
 * Los contenedores con opciones propias de presentación en su inspector
 * (components/site-builder/inspector/FichaBlockOptions.vue). Cada una cambia
 * algo que la web ya lee de la plantilla; los demás sólo se estilizan.
 */
const OPTION_FIELDS = new Set(['b.summary', 'b.description', 'b.keyfacts', 'b.gallery', 's.energia', 's.ubicacion', 'b.contact', 'b.similar'])
export function fichaNodeHasOptions(field: string): boolean {
  return OPTION_FIELDS.has(field)
}

/**
 * Lo que la ficha necesita para funcionar y no se oculta —ni de la lista de
 * secciones ni por tamaño de pantalla—: las migas, la galería, la tarjeta
 * principal con el título, el precio con la próxima visita, la barra de
 * apartados y «Atendido por» con su formulario (la vía de contacto). Se les
 * cambia el aspecto, nunca su presencia.
 */
export const FICHA_REQUIRED_NODES: readonly string[] = ['b.breadcrumbs', 'b.gallery', 'b.summary', 'd.title', 'b.nav', 'b.price', 'b.contact']
export function fichaNodeRequired(field: string): boolean {
  return FICHA_REQUIRED_NODES.includes(field)
}

export function isFichaNodeField(field: unknown): field is string {
  return typeof field === 'string' && BY_FIELD.has(field)
}

/** Los campos de texto fijo de la plantilla: los únicos que se guardan como texto en `content`. */
export const FICHA_TEXT_FIELDS: string[] = FICHA_NODES.filter((n) => n.role === 'text').map((n) => n.field)

/** Longitud máxima de un texto reescrito: un título o una etiqueta, no un párrafo. */
export const FICHA_TEXT_MAX = 120

/** El texto que se enseña: el reescrito en la plantilla o, sin él, el de partida del nodo. */
export function fichaText(content: Record<string, unknown> | null | undefined, field: string): string {
  const saved = content?.[field]
  if (typeof saved === 'string' && saved.trim()) return saved
  return BY_FIELD.get(field)?.defaultText || ''
}

/** Lo que se guarda de los textos de la plantilla: sólo los nodos `text` del registro, con texto y acotados. */
export function sanitizeFichaTexts(content: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!content || typeof content !== 'object') return out
  for (const field of FICHA_TEXT_FIELDS) {
    const v = content[field]
    if (typeof v !== 'string') continue
    // Sin saltos de línea ni caracteres de control: es una etiqueta, no un párrafo.
    // eslint-disable-next-line no-control-regex
    const clean = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, FICHA_TEXT_MAX)
    // Sin texto no se guarda: la web sigue enseñando el suyo (el traducido de siempre).
    if (clean) out[field] = clean
  }
  return out
}

/** Sólo los estilos de los nodos que existen en la ficha. */
export function filterFichaNodeStyles<T>(styles: Record<string, T> | undefined | null): Record<string, T> | undefined {
  if (!styles) return undefined
  const out: Record<string, T> = {}
  for (const [field, style] of Object.entries(styles)) if (BY_FIELD.has(field)) out[field] = style
  return Object.keys(out).length ? out : undefined
}

export interface FichaTreeNode {
  def: FichaNodeDef
  children: FichaTreeNode[]
}

/** El árbol de la ficha para «Estructura»: los bloques de primer nivel con sus hijos (sin los textos y datos sueltos). */
export function fichaTree(order: string[], hidden: Set<string>): { top: FichaTreeNode[]; hidden: Set<string> } {
  const childrenOf = (parent: string): FichaTreeNode[] => FICHA_NODES.filter((n) => n.parent === parent).map((def) => ({ def, children: childrenOf(def.field) }))
  const byField = (f: string) => BY_FIELD.get(f)!
  // Las secciones en el orden dado y, detrás, las que falten (nunca queda una fuera del árbol).
  const known = order.map((key) => `s.${key}`).filter((f, i, all) => BY_FIELD.has(f) && all.indexOf(f) === i)
  const sectionOrder = [...known, ...SECTION_BLOCKS.filter((n) => n.section && !known.includes(n.field)).map((n) => n.field)]
  const fixed = [...FIXED_BLOCKS.map((n) => n.field)]
  const aside = ASIDE_BLOCKS.filter((n) => !n.parent).map((n) => n.field)
  const top = [...fixed, ...sectionOrder, ...aside].map((f) => ({ def: byField(f), children: childrenOf(f) }))
  return { top, hidden }
}

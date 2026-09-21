import { fontStack, isKnownFont } from './fonts'

/**
 * Nodos editables del Constructor Web.
 *
 * Un bloque (`SiteBlock`) sigue siendo la unidad de la página — lo que se
 * añade, ordena, duplica y publica. Dentro de él, cada título, párrafo,
 * botón, imagen o tarjeta es un **nodo**: algo que se puede seleccionar con
 * un clic en el lienzo y estilizar por separado. Este fichero es el modelo
 * de esos nodos, compartido por el lienzo, el inspector, el servidor y la
 * web pública:
 *
 * - `NODE_KINDS`: qué clases de nodo existen y qué se puede tocar en cada
 *   una (un título no tiene "fondo"; una imagen no tiene "tipografía"). El
 *   inspector se construye a partir de esto, no de un `switch` por bloque.
 * - `NodeStyle`: los estilos de un nodo como propiedades estructuradas
 *   (tamaño en px, peso numérico, color hex…), nunca CSS libre. Se guardan
 *   en `block.nodeStyles[campo]` y se sanean en el servidor con
 *   `sanitizeNodeStyles()` — lo que no está en `STYLE_SPECS` no se guarda.
 * - `buildNodeStylesCss()`: la única traducción de esas propiedades a CSS.
 *   El DOM nunca es la fuente de verdad: el modelo se convierte en una hoja
 *   de estilos con selectores `[data-sb-node="bloque:campo"]`, la misma en
 *   el lienzo (en vivo) y en la web publicada (en el SSR).
 *
 * Responsive: el valor base es el de escritorio; `responsive.tablet` y
 * `responsive.mobile` sólo guardan lo que cambia en ese tamaño y se aplican
 * con media queries reales (max-width), así que un móvil hereda de tablet
 * y tablet de escritorio, exactamente como en CSS.
 */

export type NodeKind = 'heading' | 'text' | 'eyebrow' | 'caption' | 'button' | 'link' | 'image' | 'card' | 'box'

export type NodeCapability =
  | 'text' // contenido de texto (estático) → edición inline e inspector
  | 'link' // destino del enlace
  | 'media' // imagen: cambiar, subir, biblioteca, alt
  | 'typography'
  | 'color'
  | 'align'
  | 'spacing'
  | 'background'
  | 'border'
  | 'radius'
  | 'imageFit'
  | 'opacity'

export interface NodeKindDef {
  label: string
  /** Se puede editar el texto directamente sobre el lienzo (doble clic / Enter). */
  inline: boolean
  capabilities: NodeCapability[]
}

export const NODE_KINDS: Record<NodeKind, NodeKindDef> = {
  heading: { label: 'Título', inline: true, capabilities: ['text', 'typography', 'color', 'align', 'spacing'] },
  text: { label: 'Texto', inline: true, capabilities: ['text', 'typography', 'color', 'align', 'spacing'] },
  eyebrow: { label: 'Etiqueta', inline: true, capabilities: ['text', 'typography', 'color', 'background', 'radius', 'spacing'] },
  caption: { label: 'Texto pequeño', inline: true, capabilities: ['text', 'typography', 'color', 'align', 'spacing'] },
  button: { label: 'Botón', inline: true, capabilities: ['text', 'link', 'typography', 'color', 'background', 'border', 'radius', 'spacing'] },
  link: { label: 'Enlace', inline: true, capabilities: ['text', 'link', 'typography', 'color', 'spacing'] },
  image: { label: 'Imagen', inline: false, capabilities: ['media', 'imageFit', 'radius', 'opacity'] },
  card: { label: 'Tarjeta', inline: false, capabilities: ['background', 'border', 'radius', 'spacing'] },
  box: { label: 'Contenedor', inline: false, capabilities: ['background', 'border', 'radius', 'spacing'] },
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && value in NODE_KINDS
}

export function nodeKindLabel(kind: string): string {
  return (NODE_KINDS as Record<string, NodeKindDef>)[kind]?.label || 'Elemento'
}

export function kindHas(kind: NodeKind, capability: NodeCapability): boolean {
  return NODE_KINDS[kind].capabilities.includes(capability)
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

export type Breakpoint = 'tablet' | 'mobile'
export type Device = 'desktop' | Breakpoint

/** Los mismos cortes que usa el lienzo (tablet 768 = md, móvil 390 < sm). */
export const BREAKPOINT_MEDIA: Record<Breakpoint, string> = {
  tablet: '(max-width: 1023.98px)',
  mobile: '(max-width: 639.98px)',
}

export interface NodeStyleProps {
  fontFamily?: string
  /** px */
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textTransform?: 'none' | 'uppercase' | 'capitalize'
  textDecoration?: 'none' | 'underline'
  /** sin unidad (multiplicador) */
  lineHeight?: number
  /** em */
  letterSpacing?: number
  color?: string
  background?: string
  borderColor?: string
  /** px */
  borderWidth?: number
  /** px */
  radius?: number
  align?: 'left' | 'center' | 'right' | 'justify'
  /** px */
  marginTop?: number
  marginBottom?: number
  paddingX?: number
  paddingY?: number
  objectFit?: 'cover' | 'contain'
  objectPosition?: string
  /** 0–100 */
  opacity?: number
}

export interface NodeStyle extends NodeStyleProps {
  responsive?: Partial<Record<Breakpoint, NodeStyleProps>>
}

type Spec =
  | { kind: 'number'; min: number; max: number; integer?: boolean }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'color' }
  | { kind: 'font' }
  | { kind: 'position' }

/**
 * Qué propiedades existen y qué valores admiten. Es la lista blanca que
 * aplica el servidor: cualquier clave o valor fuera de aquí se descarta en
 * silencio, así que el JSON guardado nunca contiene nada que este fichero
 * no sepa convertir a CSS.
 */
export const STYLE_SPECS: Record<keyof NodeStyleProps, Spec> = {
  fontFamily: { kind: 'font' },
  fontSize: { kind: 'number', min: 8, max: 200 },
  fontWeight: { kind: 'enum', values: ['300', '400', '500', '600', '700', '800'] },
  fontStyle: { kind: 'enum', values: ['normal', 'italic'] },
  textTransform: { kind: 'enum', values: ['none', 'uppercase', 'capitalize'] },
  textDecoration: { kind: 'enum', values: ['none', 'underline'] },
  lineHeight: { kind: 'number', min: 0.8, max: 3 },
  letterSpacing: { kind: 'number', min: -0.1, max: 1 },
  color: { kind: 'color' },
  background: { kind: 'color' },
  borderColor: { kind: 'color' },
  borderWidth: { kind: 'number', min: 0, max: 12, integer: true },
  radius: { kind: 'number', min: 0, max: 200, integer: true },
  align: { kind: 'enum', values: ['left', 'center', 'right', 'justify'] },
  marginTop: { kind: 'number', min: 0, max: 240, integer: true },
  marginBottom: { kind: 'number', min: 0, max: 240, integer: true },
  paddingX: { kind: 'number', min: 0, max: 120, integer: true },
  paddingY: { kind: 'number', min: 0, max: 120, integer: true },
  objectFit: { kind: 'enum', values: ['cover', 'contain'] },
  objectPosition: { kind: 'position' },
  opacity: { kind: 'number', min: 0, max: 100, integer: true },
}

/** Los valores de foco que ofrece el inspector; el saneado admite también cualquier `X% Y%`. */
export const OBJECT_POSITIONS = ['50% 50%', '50% 0%', '50% 100%', '0% 50%', '100% 50%'] as const

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const POSITION = /^(?:\d{1,3})% (?:\d{1,3})%$/

export function normalizeColor(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const v = input.trim().toLowerCase()
  if (v === 'transparent') return v
  return HEX_COLOR.test(v) ? v : undefined
}

function sanitizeValue(spec: Spec, raw: unknown): string | number | undefined {
  switch (spec.kind) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
      if (!Number.isFinite(n)) return undefined
      const clamped = Math.min(spec.max, Math.max(spec.min, n))
      return spec.integer ? Math.round(clamped) : Math.round(clamped * 1000) / 1000
    }
    case 'enum': {
      const v = typeof raw === 'number' ? String(raw) : raw
      return typeof v === 'string' && spec.values.includes(v) ? v : undefined
    }
    case 'color':
      return normalizeColor(raw)
    case 'font':
      return isKnownFont(raw) ? raw : undefined
    case 'position': {
      if (typeof raw !== 'string') return undefined
      const v = raw.trim()
      return POSITION.test(v) ? v : undefined
    }
  }
}

export function sanitizeNodeStyleProps(input: unknown): NodeStyleProps {
  const out: Record<string, string | number> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, spec] of Object.entries(STYLE_SPECS) as [keyof NodeStyleProps, Spec][]) {
    const raw = (input as Record<string, unknown>)[key]
    if (raw === undefined || raw === null || raw === '') continue
    const value = sanitizeValue(spec, raw)
    if (value === undefined) continue
    // fontWeight viaja como número aunque su spec sea un enum de cadenas.
    out[key] = key === 'fontWeight' ? Number(value) : value
  }
  return out as NodeStyleProps
}

/** `undefined` cuando no queda nada que guardar — así un nodo sin estilos no deja rastro en el JSON. */
export function sanitizeNodeStyle(input: unknown): NodeStyle | undefined {
  if (!input || typeof input !== 'object') return undefined
  const style: NodeStyle = sanitizeNodeStyleProps(input)
  const responsiveRaw = (input as Record<string, unknown>).responsive
  if (responsiveRaw && typeof responsiveRaw === 'object') {
    const responsive: NodeStyle['responsive'] = {}
    for (const bp of ['tablet', 'mobile'] as Breakpoint[]) {
      const props = sanitizeNodeStyleProps((responsiveRaw as Record<string, unknown>)[bp])
      if (Object.keys(props).length) responsive[bp] = props
    }
    if (Object.keys(responsive).length) style.responsive = responsive
  }
  return hasNodeOverrides(style) ? style : undefined
}

const NODE_KEY = /^[a-z0-9][a-z0-9_.-]{0,63}$/i
export const MAX_NODES_PER_BLOCK = 80

export function isValidNodeKey(key: unknown): key is string {
  return typeof key === 'string' && NODE_KEY.test(key)
}

export function sanitizeNodeStyles(input: unknown): Record<string, NodeStyle> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const out: Record<string, NodeStyle> = {}
  let count = 0
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isValidNodeKey(key)) continue
    const style = sanitizeNodeStyle(value)
    if (!style) continue
    if (++count > MAX_NODES_PER_BLOCK) break
    out[key] = style
  }
  return Object.keys(out).length ? out : undefined
}

export function hasNodeOverrides(style: NodeStyle | undefined | null): boolean {
  if (!style) return false
  for (const key of Object.keys(STYLE_SPECS)) if ((style as Record<string, unknown>)[key] !== undefined) return true
  const r = style.responsive
  return !!r && (Object.keys(r.tablet || {}).length > 0 || Object.keys(r.mobile || {}).length > 0)
}

/**
 * Valor efectivo de cada propiedad en un dispositivo, siguiendo la misma
 * herencia que producen las media queries: móvil ← tablet ← escritorio.
 * Es lo que el inspector enseña como "heredado" cuando el dispositivo actual
 * no define la propiedad.
 */
export function resolveNodeProps(style: NodeStyle | undefined, device: Device): NodeStyleProps {
  if (!style) return {}
  const { responsive, ...base } = style
  if (device === 'desktop') return { ...base }
  if (device === 'tablet') return { ...base, ...(responsive?.tablet || {}) }
  return { ...base, ...(responsive?.tablet || {}), ...(responsive?.mobile || {}) }
}

/** Los valores que ESTE dispositivo define explícitamente (sin herencia). */
export function ownNodeProps(style: NodeStyle | undefined, device: Device): NodeStyleProps {
  if (!style) return {}
  if (device === 'desktop') {
    const { responsive: _r, ...base } = style
    return base
  }
  return { ...(style.responsive?.[device] || {}) }
}

/**
 * Escribe una propiedad para un dispositivo (o la borra con `undefined`) y
 * devuelve el estilo resultante ya saneado — el mismo camino que seguirá el
 * servidor, así el lienzo nunca pinta algo que luego no se guardaría.
 */
export function withNodeProp(style: NodeStyle | undefined, device: Device, key: keyof NodeStyleProps, value: unknown): NodeStyle | undefined {
  const draft: Record<string, unknown> = { ...(style || {}) }
  if (device === 'desktop') {
    draft[key] = value
  } else {
    const responsive = { ...((style?.responsive as Record<string, unknown>) || {}) }
    const own = { ...((responsive[device] as Record<string, unknown>) || {}) }
    own[key] = value
    responsive[device] = own
    draft.responsive = responsive
  }
  return sanitizeNodeStyle(draft)
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/** Raíz que envuelve la página (SiteBlockRenderer): da a las reglas de nodo más peso que a las clases de utilidad y a las reglas globales. */
export const PAGE_ROOT_ATTR = 'data-site-page'
export const NODE_ATTR = 'data-sb-node'

export function nodeId(blockId: string, field: string): string {
  return `${blockId}:${field}`
}

export function nodeSelector(blockId: string, field: string): string {
  return `[${PAGE_ROOT_ATTR}] [${NODE_ATTR}="${nodeId(blockId, field)}"]`
}

function px(n: number): string {
  return `${n}px`
}

/** Declaraciones CSS (sin `!important`) de un conjunto de propiedades. */
export function styleDeclarations(props: NodeStyleProps | undefined): string[] {
  if (!props) return []
  const d: string[] = []
  if (props.fontFamily) d.push(`font-family:${fontStack(props.fontFamily)}`)
  if (props.fontSize !== undefined) d.push(`font-size:${px(props.fontSize)}`)
  if (props.fontWeight !== undefined) d.push(`font-weight:${props.fontWeight}`)
  if (props.fontStyle) d.push(`font-style:${props.fontStyle}`)
  if (props.textTransform) d.push(`text-transform:${props.textTransform}`)
  if (props.textDecoration) d.push(`text-decoration:${props.textDecoration}`)
  if (props.lineHeight !== undefined) d.push(`line-height:${props.lineHeight}`)
  if (props.letterSpacing !== undefined) d.push(`letter-spacing:${props.letterSpacing}em`)
  if (props.color) d.push(`color:${props.color}`)
  if (props.background) d.push(`background-color:${props.background}`)
  if (props.borderWidth !== undefined) d.push(`border:${px(props.borderWidth)} solid ${props.borderColor || 'currentColor'}`)
  else if (props.borderColor) d.push(`border-color:${props.borderColor}`)
  if (props.radius !== undefined) d.push(`border-radius:${px(props.radius)}`)
  if (props.align) d.push(`text-align:${props.align}`)
  if (props.marginTop !== undefined) d.push(`margin-top:${px(props.marginTop)}`)
  if (props.marginBottom !== undefined) d.push(`margin-bottom:${px(props.marginBottom)}`)
  if (props.paddingX !== undefined) d.push(`padding-left:${px(props.paddingX)}`, `padding-right:${px(props.paddingX)}`)
  if (props.paddingY !== undefined) d.push(`padding-top:${px(props.paddingY)}`, `padding-bottom:${px(props.paddingY)}`)
  if (props.objectFit) d.push(`object-fit:${props.objectFit}`)
  if (props.objectPosition) d.push(`object-position:${props.objectPosition}`)
  if (props.opacity !== undefined) d.push(`opacity:${props.opacity / 100}`)
  return d
}

function rule(selector: string, declarations: string[]): string {
  // `!important` a propósito: es la elección explícita de quien edita y
  // tiene que ganar a las clases de utilidad del bloque (incluidas las que
  // ya llevan `!`, como el color de las etiquetas sobre fondo oscuro).
  return declarations.length ? `${selector}{${declarations.map((x) => `${x}!important`).join(';')}}` : ''
}

/** Las reglas CSS de un nodo: base + una media query por breakpoint con overrides. */
export function nodeStyleCss(blockId: string, field: string, style: NodeStyle | undefined): string {
  if (!style || !isValidNodeKey(blockId) || !isValidNodeKey(field)) return ''
  const selector = nodeSelector(blockId, field)
  let css = rule(selector, styleDeclarations(style))
  for (const bp of ['tablet', 'mobile'] as Breakpoint[]) {
    const inner = rule(selector, styleDeclarations(style.responsive?.[bp]))
    if (inner) css += `@media ${BREAKPOINT_MEDIA[bp]}{${inner}}`
  }
  return css
}

export interface BlockWithNodeStyles {
  id: string
  nodeStyles?: Record<string, NodeStyle> | null
}

/** La hoja de estilos de todos los nodos de una página, en orden de bloques. */
export function buildNodeStylesCss(blocks: BlockWithNodeStyles[] | undefined | null): string {
  let css = ''
  for (const block of blocks || []) {
    if (!block?.nodeStyles) continue
    for (const [field, style] of Object.entries(block.nodeStyles)) css += nodeStyleCss(block.id, field, style)
  }
  return css
}

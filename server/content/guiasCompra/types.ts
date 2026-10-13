/**
 * Las guías de compra del blog (seis artículos evergreen para quien quiere
 * comprar una vivienda), como contenido versionado en el código: la demo las
 * siembra (server/demo/events/web.ts) y el host principal las publica
 * (server/utils/blog/buyerGuides.ts). Cada artículo es una lista de bloques
 * del CMS (components/CmsBlockRenderer.vue), con sus imágenes y metadatos.
 */
export interface GuiaImage {
  /** Ruta dentro de public/demo-assets/norte-astur/ (ver CREDITOS.md). */
  file: string
  alt: string
  caption?: string
  /** Autor y licencia, tal como se acredita. */
  credit: string
  width: number
  height: number
}

export interface GuiaArticle {
  key: string
  slug: string
  title: string
  /** Subtítulo descriptivo (excerpt del CMS). */
  subtitle: string
  seoTitle: string
  seoDescription: string
  focusKeyword: string
  category: 'guias'
  /** Fecha de la última revisión editorial del contenido (AAAA-MM-DD). */
  reviewedAt: string
  cover: GuiaImage
  /** Slugs de los artículos relacionados (se enlazan al final). */
  related: string[]
  blocks: Record<string, any>[]
}

/** Imagen del cuerpo: el seed sustituye `src` por la clave subida; el host principal la sirve desde /demo-assets. */
export function img(image: GuiaImage, opts: { wide?: boolean } = {}): Record<string, any> {
  // Sin fotografía elegida todavía (crédito «pendiente»): el bloque va sin `src` y el renderizador no lo enseña.
  const pending = image.credit === 'pendiente'
  return { type: 'image', src: pending ? '' : `blog/${image.file}`, pending, alt: image.alt, caption: image.caption, credit: image.credit, width: image.width, height: image.height, wide: opts.wide ?? false }
}
export const h2 = (text: string) => ({ type: 'heading', level: 2, text })
export const h3 = (text: string) => ({ type: 'heading', level: 3, text })
export const p = (text: string) => ({ type: 'paragraph', text })
export const tip = (text: string) => ({ type: 'callout', variant: 'success', text })
export const warn = (text: string) => ({ type: 'callout', variant: 'warning', text })
export const info = (text: string) => ({ type: 'callout', variant: 'info', text })
export const quote = (text: string, author?: string) => ({ type: 'quote', text, author })
export const table = (rows: string[][]) => ({ type: 'table', rows })
export const faq = (items: Array<{ q: string; a: string }>) => ({ type: 'faq', items })
export const cta = (title: string, text: string, buttonText: string, buttonUrl: string) => ({ type: 'cta', title, text, buttonText, buttonUrl })
export const keypoints = (items: string[], title = 'En resumen') => ({ type: 'keypoints', title, items })

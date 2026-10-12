import { blocksToPlainText } from '../../utils/cms'
import { inlineLinks } from '../../../utils/cmsInline'
import { comoSaberViviendaBienPrecio } from './como-saber-vivienda-bien-precio'
import { gastosImpuestosComprarVivienda } from './gastos-impuestos-comprar-vivienda'
import { guiaComprarVivienda } from './guia-comprar-vivienda'
import { IMAGES } from './images'
import { obraNuevaVsSegundaMano } from './obra-nueva-vs-segunda-mano'
import { preguntasAntesComprarVivienda } from './preguntas-antes-comprar-vivienda'
import { queRevisarAntesComprarCasa } from './que-revisar-antes-comprar-casa'
import type { GuiaArticle, GuiaImage } from './types'

export type { GuiaArticle, GuiaImage } from './types'
export { IMAGES } from './images'

/** Las seis guías de compra, en el orden en que se publican (la primera es la guía principal del listado). */
export const GUIAS_COMPRA: GuiaArticle[] = [
  guiaComprarVivienda,
  gastosImpuestosComprarVivienda,
  queRevisarAntesComprarCasa,
  comoSaberViviendaBienPrecio,
  obraNuevaVsSegundaMano,
  preguntasAntesComprarVivienda,
]

/** Autora editorial de las guías (la misma persona ficticia que firma el resto del blog de la demo). */
export const GUIAS_AUTHOR = { name: 'Carmen Valdés', slug: 'carmen-valdes', specialty: 'Asesora inmobiliaria' }

export const GUIAS_CATEGORY = { name: 'Guías', slug: 'guias', description: 'Guías prácticas para comprar una vivienda con criterio.' }

export function guiaBySlug(slug: string): GuiaArticle | undefined {
  return GUIAS_COMPRA.find((g) => g.slug === slug)
}

/** Palabras del texto visible (sin marcas en línea ni los parámetros de los interactivos). */
export function guiaWordCount(guia: GuiaArticle): number {
  return blocksToPlainText(guia.blocks as any).split(/\s+/).filter(Boolean).length
}

/** Imágenes que usa una guía: la portada y las de sus bloques `image`. */
export function guiaImages(guia: GuiaArticle): GuiaImage[] {
  const files = new Set<string>()
  const out: GuiaImage[] = [guia.cover]
  files.add(guia.cover.file)
  for (const b of guia.blocks) {
    if (b.type !== 'image') continue
    const file = String(b.src || '').replace(/^blog\//, '')
    const image = Object.values(IMAGES).find((i) => i.file === file)
    if (image && !files.has(image.file)) {
      files.add(image.file)
      out.push(image)
    }
  }
  return out
}

/** Enlaces internos (`/blog/...`, `/propiedades...`, `/contacto`) de una guía, para comprobar que no apuntan a nada roto. */
export function guiaInternalLinks(guia: GuiaArticle): string[] {
  const links: string[] = []
  for (const b of guia.blocks) {
    for (const field of ['text', 'intro']) if (typeof b[field] === 'string') links.push(...inlineLinks(b[field]))
    for (const item of b.items || []) {
      if (typeof item === 'object' && item) for (const v of Object.values(item)) if (typeof v === 'string') links.push(...inlineLinks(v))
    }
    if (b.type === 'cta' && b.buttonUrl) links.push(b.buttonUrl)
  }
  return links.filter((l) => l.startsWith('/'))
}

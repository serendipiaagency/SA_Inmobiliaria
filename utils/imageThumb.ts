/**
 * Miniaturas de la galería generadas en el navegador del panel (Cola 5): no
 * hay servicio de variantes de imagen en el Worker (ni Cloudflare Images ni
 * un módulo de redimensión), así que la miniatura WebP se crea con un
 * <canvas> al subir la foto (o con «Generar miniaturas» para las que no la
 * tienen) y se sube como un fichero público más de la agencia. La web la usa
 * en el mosaico, las categorías y la cuadrícula del visor; el original sólo
 * se descarga al ampliar. Sin miniatura, la web sigue usando el original.
 */
export const THUMB_MAX_WIDTH = 640
export const THUMB_QUALITY = 0.8

export interface ThumbResult {
  blob: Blob
  width: number
  height: number
}

/** Dimensiones de la miniatura que cabe en `maxWidth` sin deformar (nunca más grande que el original). */
export function thumbSize(width: number, height: number, maxWidth = THUMB_MAX_WIDTH): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) }
  const ratio = maxWidth / width
  return { width: maxWidth, height: Math.max(1, Math.round(height * ratio)) }
}

/** El nombre del fichero de la miniatura a partir del original: `foto.jpg` → `foto.thumb.webp`. */
export function thumbFileName(original: string): string {
  const base = (original || 'imagen').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'imagen'
  return `${base}.thumb.webp`
}

/** Carga una imagen (fichero o URL del mismo origen) en un elemento <img>. */
function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

/**
 * Genera la miniatura WebP de una imagen (fichero local o URL del mismo
 * origen, p. ej. /api/media/<clave>). Devuelve null si el navegador no sabe
 * (sin canvas, sin WebP) o si la imagen no se puede leer: entonces la web
 * usa el original, como hasta ahora.
 */
export async function makeThumbnail(src: Blob | string, maxWidth = THUMB_MAX_WIDTH): Promise<ThumbResult | null> {
  if (typeof document === 'undefined') return null
  try {
    const img = await loadImage(src)
    const { width, height } = thumbSize(img.naturalWidth, img.naturalHeight, maxWidth)
    if (!width || !height) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', THUMB_QUALITY))
    if (!blob || blob.type !== 'image/webp') return null
    return { blob, width, height }
  } catch {
    return null
  }
}

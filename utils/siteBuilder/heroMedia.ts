/**
 * Fondo del Hero (Constructor Web › Hero › Multimedia): un bucle de imágenes
 * o una imagen fija. Sin Vue ni navegador: lo usan HeroSearch.vue (web
 * pública y lienzo) y las pruebas.
 *
 * - `slideshow` (por defecto, lo que ya había): las imágenes del bucle, una
 *   cada `HERO_SLIDE_SECONDS`, con fundido y un zoom lento. Con una sola, se
 *   queda fija.
 * - `static`: una sola imagen, quieta. La elegida en «Imagen de fondo» o, si
 *   no hay, la primera del bucle; las del bucle se conservan por si se vuelve
 *   a él.
 */

export type HeroBackgroundMode = 'slideshow' | 'static'

/** Segundos que se ve cada imagen del bucle. */
export const HERO_SLIDE_SECONDS = 7

export function heroBackgroundMode(value: unknown): HeroBackgroundMode {
  return value === 'static' ? 'static' : 'slideshow'
}

function cleanList(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

/** Las imágenes que pinta el Hero, en orden. `fallback` son las de por defecto, para cuando no se ha subido ninguna. */
export function heroFrames(opts: { mode: unknown; image?: unknown; slides?: unknown; fallback: string[] }): string[] {
  const slides = cleanList(opts.slides)
  const pool = slides.length ? slides : cleanList(opts.fallback)
  if (heroBackgroundMode(opts.mode) === 'static') {
    const image = typeof opts.image === 'string' && opts.image.trim() ? opts.image : pool[0]
    return image ? [image] : []
  }
  return pool
}

import { listPublicGallery } from './properties/media'

/**
 * Attaches a `photos` array (cover first, then up to N gallery images) to each
 * project row so cards can render an image carousel. One extra query total
 * (por trozos de 80 ids, el límite de parámetros de D1).
 *
 * Sólo fotos que pueden salir fuera del panel (FASE 7, bloque N7a):
 * publicables, no privadas y no ocultas, en el orden de la galería — antes
 * salían todas, sin orden. Lo usan la web pública (portada, listado,
 * similares), el widget, la API v1 y la vista previa del Constructor Web.
 */
export async function attachPhotos<T extends { id: number; coverImage?: string | null }>(
  db: any,
  rows: T[],
  perProject = 5,
): Promise<(T & { photos: string[] })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, photos: [r.coverImage].filter(Boolean) as string[] }))
  const gallery = await listPublicGallery(
    db,
    'developer',
    rows.map((r) => r.id),
  )
  return rows.map((r) => {
    const images = (gallery.get(r.id) || []).slice(0, perProject).map((g) => g.image)
    const photos = [r.coverImage, ...images].filter(Boolean) as string[]
    return { ...r, photos: [...new Set(photos)].slice(0, perProject + 1) }
  })
}

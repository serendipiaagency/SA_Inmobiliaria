import { inArray } from 'drizzle-orm'
import { schema } from './db'

/**
 * Attaches a `photos` array (cover first, then up to N gallery images) to each
 * project row so cards can render an image carousel. One extra query total.
 */
export async function attachPhotos<T extends { id: number; coverImage?: string | null }>(
  db: any,
  rows: T[],
  perProject = 5,
): Promise<(T & { photos: string[] })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, photos: [r.coverImage].filter(Boolean) as string[] }))
  const ids = rows.map((r) => r.id)
  const imgs = await db
    .select({ pid: schema.images.developerPropertyId, image: schema.images.image })
    .from(schema.images)
    .where(inArray(schema.images.developerPropertyId, ids))
  const byId: Record<number, string[]> = {}
  for (const im of imgs) {
    ;(byId[im.pid] ||= []).push(im.image)
  }
  return rows.map((r) => {
    const gallery = (byId[r.id] || []).slice(0, perProject)
    const photos = [r.coverImage, ...gallery].filter(Boolean) as string[]
    return { ...r, photos: [...new Set(photos)].slice(0, perProject + 1) }
  })
}

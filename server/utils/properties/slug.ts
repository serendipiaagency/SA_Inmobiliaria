import { and, eq, like } from 'drizzle-orm'
import { slugify } from '../db'

/**
 * El slug de una propiedad al crearla (Cola 11): sale del título, sin tildes,
 * sin espacios ni caracteres no válidos («Ático reformado con terraza en
 * Gijón» → `atico-reformado-con-terraza-en-gijon`), y es único dentro de la
 * empresa: si ya existe, `-2`, `-3`… (el primero libre), nunca un número al
 * azar. Sólo se genera al crear y sólo si no se escribió uno a mano: **editar
 * el título de una propiedad ya creada no cambia nunca su dirección pública**,
 * así que ningún enlace publicado se rompe.
 *
 * El índice único (empresa, slug) de obra nueva sigue siendo la última red de
 * seguridad ante dos altas simultáneas: una colisión devuelve el 409 de siempre.
 */
export const SLUG_MAX = 80

/** Los slugs ya ocupados de la empresa que empiezan por `base` (el propio y sus sufijos). */
async function takenSlugs(db: any, table: any, orgId: number, base: string): Promise<Set<string>> {
  const rows: { slug: string | null }[] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(and(eq(table.organizationId, orgId), like(table.slug, `${base.replace(/[%_]/g, '')}%`)))
  return new Set(rows.map((r) => String(r.slug)))
}

/** El primer slug libre para `title`, o null si el título no deja ningún carácter válido. */
export async function uniquePropertySlug(db: any, table: any, orgId: number, title: unknown): Promise<string | null> {
  const base = slugify(String(title ?? ''))
  if (!base) return null
  const taken = await takenSlugs(db, table, orgId, base)
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base.slice(0, SLUG_MAX - 5)}-${Math.floor(Math.random() * 10000)}`
}

import { and, eq, inArray } from 'drizzle-orm'
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

/**
 * Cuáles de estos slugs ya están ocupados en la empresa. Con `eq`/`inArray` y
 * no con `LIKE`: D1 rechaza los patrones de más de 50 bytes («LIKE or GLOB
 * pattern too complex») y un título largo da un slug más largo que eso.
 */
async function takenAmong(db: any, table: any, orgId: number, candidates: string[]): Promise<Set<string>> {
  const rows: { slug: string | null }[] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(and(eq(table.organizationId, orgId), inArray(table.slug, candidates)))
  return new Set(rows.map((r) => String(r.slug)))
}

const SUFFIXES_PER_QUERY = 40

function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`
  return `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`
}

/** El primer slug libre para `title`, o null si el título no deja ningún carácter válido. */
export async function uniquePropertySlug(db: any, table: any, orgId: number, title: unknown): Promise<string | null> {
  const base = slugify(String(title ?? '')).slice(0, SLUG_MAX).replace(/-+$/, '')
  if (!base) return null
  if (!(await takenAmong(db, table, orgId, [base])).has(base)) return base
  for (let from = 2; from < 1000; from += SUFFIXES_PER_QUERY) {
    const candidates = Array.from({ length: SUFFIXES_PER_QUERY }, (_, i) => withSuffix(base, from + i))
    const taken = await takenAmong(db, table, orgId, candidates)
    const free = candidates.find((c) => !taken.has(c))
    if (free) return free
  }
  return `${base.slice(0, SLUG_MAX - 5)}-${Math.floor(Math.random() * 10000)}`
}

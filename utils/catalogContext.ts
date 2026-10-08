/**
 * El contexto del catálogo para «‹ Anterior» / «Siguiente ›» de la ficha
 * (#111): el catálogo (pages/propiedades/index.vue) guarda en esta pestaña
 * los resultados que enseña — en su orden, con sus filtros y su posición en
 * el total — y la ficha lo lee para ir a la propiedad de al lado dentro de
 * esa misma búsqueda. Sólo slugs y nombres públicos; nada sale del navegador.
 *
 * `start` es la posición (desde 0) del primer elemento de `items` en el total
 * de resultados: así la ficha puede pedir la página de antes o la de después
 * con los mismos filtros cuando llega al borde de lo guardado.
 */

export interface CatalogContextItem {
  slug: string
  name: string
}

export interface CatalogContext {
  /** La dirección del catálogo con sus filtros, para volver a él desde las migas. */
  href: string
  /** La consulta de la API con la que se pidieron los resultados (sin `page`). */
  query: Record<string, string>
  perPage: number
  total: number
  start: number
  items: CatalogContextItem[]
}

export const CATALOG_CONTEXT_KEY = 'inmo:catalog-context'
/** Lo más que se guarda: unas cuantas páginas seguidas bastan para ir y venir. */
export const CATALOG_CONTEXT_MAX_ITEMS = 240

function isItem(v: unknown): v is CatalogContextItem {
  return !!v && typeof (v as any).slug === 'string' && !!(v as any).slug && typeof (v as any).name === 'string'
}

/** Lo guardado, sólo si tiene la forma esperada (la pestaña podría traer algo antiguo o tocado). */
export function parseCatalogContext(raw: string | null | undefined): CatalogContext | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || typeof v.href !== 'string' || !v.href.startsWith('/')) return null
    const items = Array.isArray(v.items) ? v.items.filter(isItem).map((x: CatalogContextItem) => ({ slug: x.slug, name: x.name })) : []
    if (!items.length) return null
    const query: Record<string, string> = {}
    for (const [k, val] of Object.entries(v.query && typeof v.query === 'object' ? v.query : {})) {
      if (typeof val === 'string' && k !== 'page' && k !== 'perPage') query[k] = val
    }
    const num = (n: unknown, min: number) => (Number.isFinite(Number(n)) ? Math.max(min, Math.floor(Number(n))) : min)
    return { href: v.href, query, perPage: num(v.perPage, 1), total: num(v.total, 0), start: num(v.start, 0), items }
  } catch {
    return null
  }
}

export function readCatalogContext(): CatalogContext | null {
  try {
    return parseCatalogContext(sessionStorage.getItem(CATALOG_CONTEXT_KEY))
  } catch {
    return null
  }
}

export function saveCatalogContext(ctx: CatalogContext): void {
  try {
    sessionStorage.setItem(CATALOG_CONTEXT_KEY, JSON.stringify(ctx))
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): la ficha usará sus vecinas por defecto.
  }
}

/** Los vecinos de una propiedad dentro de lo guardado, o `null` si no está en ello. */
export function neighborsInContext(ctx: CatalogContext | null, slug: string): { index: number; prev: CatalogContextItem | null; next: CatalogContextItem | null } | null {
  if (!ctx) return null
  const index = ctx.items.findIndex((x) => x.slug === slug)
  if (index < 0) return null
  return { index, prev: ctx.items[index - 1] || null, next: ctx.items[index + 1] || null }
}

/** La página (desde 1) de la API que va justo antes de lo guardado, si la hay. */
export function previousPage(ctx: CatalogContext): number | null {
  return ctx.start > 0 ? Math.floor((ctx.start - 1) / ctx.perPage) + 1 : null
}

/** La página (desde 1) de la API que va justo después de lo guardado, si la hay. */
export function nextPage(ctx: CatalogContext): number | null {
  const end = ctx.start + ctx.items.length
  return end < ctx.total ? Math.floor(end / ctx.perPage) + 1 : null
}

/** Lo guardado con una página más delante o detrás, sin repetir y sin pasar del máximo. */
export function mergePage(ctx: CatalogContext, page: number, rows: CatalogContextItem[]): CatalogContext {
  const pageStart = (page - 1) * ctx.perPage
  const fresh = rows.filter(isItem).filter((r) => !ctx.items.some((x) => x.slug === r.slug))
  let items: CatalogContextItem[]
  let start: number
  if (pageStart < ctx.start) {
    items = [...fresh, ...ctx.items]
    start = Math.max(0, ctx.start - fresh.length)
  } else {
    items = [...ctx.items, ...fresh]
    start = ctx.start
  }
  if (items.length > CATALOG_CONTEXT_MAX_ITEMS) {
    // Se recorta por el lado contrario al que se acaba de añadir.
    if (pageStart < ctx.start) items = items.slice(0, CATALOG_CONTEXT_MAX_ITEMS)
    else {
      const cut = items.length - CATALOG_CONTEXT_MAX_ITEMS
      items = items.slice(cut)
      start += cut
    }
  }
  return { ...ctx, items, start }
}

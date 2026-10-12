import { and, eq, inArray, isNull } from 'drizzle-orm'
import { DEFAULT_PUBLIC_ORG_ID, schema } from '../db'
import { blocksToPlainText, computeReadingTime, computeSeoScore, countLinks, parseBlocks } from '../cms'
import { GUIAS_CATEGORY, GUIAS_COMPRA, type GuiaArticle } from '../../content/guiasCompra'

/**
 * Las guías de compra en el blog del host principal (la organización por
 * defecto, DEFAULT_PUBLIC_ORG_ID, cuya web pública vive junto a la landing
 * de INMO). Se publican de forma perezosa e idempotente la primera vez que
 * alguien pide el blog: cada guía que falte (por slug) se inserta como
 * artículo publicado; las que ya existen no se tocan, así que el equipo
 * puede editarlas desde Blog & CMS sin que se sobrescriban.
 *
 * Las imágenes se sirven como ficheros estáticos (/demo-assets/norte-astur/
 * blog/*.webp, CC0, ver CREDITOS.md): no se sube nada a R2 y no hace falta
 * autor (el publisher del BlogPosting es la propia empresa).
 *
 * La cuenta demo NO pasa por aquí: sus guías las siembra server/demo/events/
 * web.ts, con las imágenes en su propio R2.
 */
export const BLOG_ASSET_BASE = '/demo-assets/norte-astur/blog'

/** Bloques de una guía con las rutas de imagen resueltas para el host principal (las pendientes se omiten). */
export function guiaBlocksForStaticHost(guia: GuiaArticle): Record<string, any>[] {
  return guia.blocks
    .filter((b) => !(b.type === 'image' && (b.pending || !b.src)))
    .map((b) => (b.type === 'image' ? { ...b, src: `${BLOG_ASSET_BASE}/${String(b.src).replace(/^blog\//, '')}` } : b))
}

export function guiaArticleValues(guia: GuiaArticle, organizationId: number, opts: { categoryId: number | null; authorId: number | null; coverImage: string; blocks: Record<string, any>[]; now: string }) {
  const contentJson = JSON.stringify(opts.blocks)
  const blocks = parseBlocks(contentJson)
  const plainText = blocksToPlainText(blocks)
  return {
    organizationId,
    authorId: opts.authorId,
    categoryId: opts.categoryId,
    title: guia.title,
    slug: guia.slug,
    excerpt: guia.subtitle,
    contentJson,
    coverImage: opts.coverImage,
    language: 'es',
    status: 'published',
    publishedAt: opts.now,
    readingTimeMinutes: computeReadingTime(blocks),
    seoTitle: guia.seoTitle,
    seoDescription: guia.seoDescription,
    focusKeyword: guia.focusKeyword,
    seoScore: computeSeoScore({ title: guia.title, slug: guia.slug, excerpt: guia.subtitle, seoTitle: guia.seoTitle, seoDescription: guia.seoDescription, focusKeyword: guia.focusKeyword, coverImage: opts.coverImage, plainText, links: countLinks(blocks) }),
    createdAt: opts.now,
    updatedAt: opts.now,
  }
}

// Una sola comprobación por isolate: la primera petición hace la consulta y las
// demás esperan su resultado. El índice único (organización, slug) cubre el
// resto: dos isolates a la vez no pueden insertar la misma guía dos veces.
let ensured: Promise<void> | null = null

export function ensureBuyerGuides(db: any, organizationId: number): Promise<void> {
  if (organizationId !== DEFAULT_PUBLIC_ORG_ID) return Promise.resolve()
  if (!ensured) {
    ensured = publishMissingGuides(db, organizationId).catch((err) => {
      // Si falla (p. ej. durante una migración), se reintenta en la siguiente petición.
      ensured = null
      console.error('[blog] no se pudieron publicar las guías de compra', err?.message || err)
    })
  }
  return ensured
}

async function publishMissingGuides(db: any, organizationId: number): Promise<void> {
  const A = schema.cmsArticles
  const slugs = GUIAS_COMPRA.map((g) => g.slug)
  const existing = await db.select({ slug: A.slug }).from(A).where(and(eq(A.organizationId, organizationId), inArray(A.slug, slugs)))
  const have = new Set(existing.map((r: { slug: string }) => r.slug))
  const missing = GUIAS_COMPRA.filter((g) => !have.has(g.slug))
  if (!missing.length) return

  const now = new Date().toISOString()
  const C = schema.cmsCategories
  let category = (await db.select({ id: C.id }).from(C).where(and(eq(C.organizationId, organizationId), eq(C.slug, GUIAS_CATEGORY.slug), isNull(C.deletedAt))).limit(1))[0]
  if (!category) {
    category = (await db.insert(C).values({ organizationId, name: GUIAS_CATEGORY.name, slug: GUIAS_CATEGORY.slug, description: GUIAS_CATEGORY.description, createdAt: now, updatedAt: now }).returning({ id: C.id }))[0]
  }

  for (const guia of missing) {
    // Fechas escalonadas (un minuto por guía) para que el listado, ordenado por fecha, empiece por la guía principal.
    const publishedAt = new Date(Date.parse(now) - GUIAS_COMPRA.indexOf(guia) * 60_000).toISOString()
    const values = guiaArticleValues(guia, organizationId, {
      categoryId: category?.id ?? null,
      authorId: null,
      coverImage: `${BLOG_ASSET_BASE}/${guia.cover.file}`,
      blocks: guiaBlocksForStaticHost(guia),
      now: publishedAt,
    })
    try {
      const [row] = await db.insert(A).values(values).returning({ id: A.id })
      await db.insert(schema.cmsArticleVersions).values({ articleId: row.id, title: guia.title, contentJson: values.contentJson, editedBy: null, createdAt: now })
    } catch (err: any) {
      // Carrera con otro isolate (índice único org+slug): la guía ya está; seguimos con la siguiente.
      if (!/UNIQUE/i.test(String(err?.message || ''))) throw err
    }
  }
}

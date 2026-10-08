import { and, desc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'
import { sanitizeNodeStyles, type NodeStyle } from '../../utils/siteBuilder/nodes'
import { sanitizeGlobalStyles, type SiteGlobalStyles } from '../../utils/siteBuilder/globalStyles'
import { PAGE_CORE_TYPE, SITE_PAGES, SITE_PAGE_KEYS, seedPageBlocks, sitePageDef } from '../../utils/siteBuilder/pages'

/**
 * The Constructor Web's data model. A page is a flat, ordered array of
 * blocks — array position IS block order, there is no separate `order`
 * field to keep in sync with it.
 *
 * `content` is intentionally untyped here: each block `type` owns its own
 * content shape (see components/site-builder/blocks/*.vue and the matching
 * editors). This file only knows how to read/write the envelope, never what
 * a specific block means.
 *
 * `nodeStyles` is the one part of a block this file *does* understand: the
 * per-element overrides of the visual editor (a title's font, a button's
 * colour…), keyed by the element's field name and sanitised against the
 * closed list in utils/siteBuilder/nodes.ts — structured properties, never
 * free CSS, so nothing the client sends can reach the published stylesheet
 * unchecked.
 */
export interface SiteBlock {
  id: string
  type: string
  version: number
  content: Record<string, any>
  style?: Record<string, any>
  /** Per-breakpoint visibility. Missing = visible everywhere. */
  visibility?: { desktop?: boolean; tablet?: boolean; mobile?: boolean }
  /** Visual-editor overrides per editable element of this block (see utils/siteBuilder/nodes.ts). */
  nodeStyles?: Record<string, NodeStyle>
}

export interface SitePageSeo {
  title?: string
  description?: string
}

export interface SitePageDocument {
  blocks: SiteBlock[]
  seo: SitePageSeo
  /** Page-wide defaults the elements inherit (fonts, button radius) — utils/siteBuilder/globalStyles.ts. */
  styles?: SiteGlobalStyles
}

export const DEFAULT_PAGE_KEY = 'home'

export const EMPTY_PAGE: SitePageDocument = { blocks: [], seo: {} }

/**
 * El primer borrador de una página (utils/siteBuilder/pages.ts): vacío para
 * la portada, y para las demás lo que la web ya enseña en esa dirección —
 * así quien abre «Nosotros» en el editor ve su página, no una en blanco.
 */
export function seedPageDocument(pageKey: string): SitePageDocument {
  return { blocks: seedPageBlocks(pageKey) as SiteBlock[], seo: {} }
}

export function parsePageJson(json: string | null | undefined): SitePageDocument {
  if (!json) return { blocks: [], seo: {} }
  try {
    const parsed = JSON.parse(json)
    const doc: SitePageDocument = {
      blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      seo: parsed?.seo && typeof parsed.seo === 'object' ? parsed.seo : {},
    }
    const styles = sanitizeGlobalStyles(parsed?.styles)
    if (styles) doc.styles = styles
    return doc
  } catch {
    return { blocks: [], seo: {} }
  }
}

/**
 * Fails closed exactly like tenantPolicy.ts's orgIdOrThrow: every helper
 * below is reached only through requireOrgScope/resolvePublicOrgId, which
 * already guarantee a real orgId — this is a second line of defense so a
 * future caller can never turn "no org resolved" into an unfiltered or
 * orphaned (organization_id = NULL) row.
 */
function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

/** Loads (or lazily creates) the org's draft row for a page key. Admin-side only. */
export async function getOrCreateSitePage(db: any, orgIdInput: number | null, pageKey: string) {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, pageKey))
  const rows = await db.select().from(schema.sitePages).where(where).limit(1)
  if (rows[0]) return rows[0]

  const nowTs = now()
  const seedJson = JSON.stringify(seedPageDocument(pageKey))
  await db.insert(schema.sitePages).values({
    organizationId: orgId,
    pageKey,
    draftJson: seedJson,
    publishedJson: null,
    version: 0,
    createdAt: nowTs,
    updatedAt: nowTs,
  })
  const created = await db.select().from(schema.sitePages).where(where).limit(1)
  return created[0]
}

/** Overwrites the draft only. Never touches publishedJson/version — that's Publish's job. */
export async function saveDraft(db: any, orgIdInput: number | null, pageKey: string, doc: SitePageDocument) {
  const page = await getOrCreateSitePage(db, orgIdInput, pageKey)
  const where = and(eq(schema.sitePages.organizationId, page.organizationId), eq(schema.sitePages.pageKey, pageKey))
  await db
    .update(schema.sitePages)
    .set({ draftJson: JSON.stringify(doc), updatedAt: now() })
    .where(where)
  return page.id as number
}

/** Copies draft -> published, bumps version, snapshots into site_page_versions. */
export async function publishPage(db: any, orgIdInput: number | null, pageKey: string, publishedByUserId: number) {
  const page = await getOrCreateSitePage(db, orgIdInput, pageKey)
  const orgId = page.organizationId as number
  const nowTs = now()
  const nextVersion = (page.version || 0) + 1

  await db
    .update(schema.sitePages)
    .set({
      publishedJson: page.draftJson,
      version: nextVersion,
      publishedAt: nowTs,
      publishedBy: publishedByUserId,
      updatedAt: nowTs,
    })
    .where(and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, pageKey)))

  await db.insert(schema.sitePageVersions).values({
    pageId: page.id,
    version: nextVersion,
    snapshotJson: page.draftJson,
    publishedBy: publishedByUserId,
    createdAt: nowTs,
  })

  return nextVersion
}

export interface SitePageVersionSummary {
  version: number
  createdAt: string
  publishedByName: string | null
  blockCount: number
  seoTitle: string | null
  /** True for the version the public site is serving right now. */
  isCurrent: boolean
}

/**
 * How many published versions the history shows. Snapshots are never deleted
 * — this only bounds the read, so an org that has published a thousand times
 * doesn't pull a thousand rows to render a panel nobody scrolls that far.
 */
export const VERSION_HISTORY_LIMIT = 50

/**
 * The org's published history, newest first.
 *
 * `site_page_versions` carries no `organizationId` of its own: it hangs off
 * `page_id`. So the tenant boundary here *is* `getOrCreateSitePage`, which
 * resolves the page row from the session's orgId — the version rows are then
 * filtered by that row's id and never by anything the caller sent. Two orgs
 * both having a "version 1" is normal and must not collide; that's what
 * sitePages.crossTenant.test.ts pins down.
 *
 * The summary fields are computed in SQL on purpose. A snapshot can be up to
 * MAX_JSON_BYTES, and the history only needs "how many blocks and what title"
 * to tell versions apart — reading 50 full documents to count their blocks in
 * JavaScript would move megabytes to render a list.
 */
export async function listPageVersions(db: any, orgIdInput: number | null, pageKey: string): Promise<SitePageVersionSummary[]> {
  const page = await getOrCreateSitePage(db, orgIdInput, pageKey)
  const rows = await db
    .select({
      version: schema.sitePageVersions.version,
      createdAt: schema.sitePageVersions.createdAt,
      publishedByName: schema.users.name,
      blockCount: sql<number | null>`json_array_length(${schema.sitePageVersions.snapshotJson}, '$.blocks')`,
      seoTitle: sql<string | null>`json_extract(${schema.sitePageVersions.snapshotJson}, '$.seo.title')`,
    })
    .from(schema.sitePageVersions)
    .leftJoin(schema.users, eq(schema.users.id, schema.sitePageVersions.publishedBy))
    .where(eq(schema.sitePageVersions.pageId, page.id))
    .orderBy(desc(schema.sitePageVersions.version))
    .limit(VERSION_HISTORY_LIMIT)

  return rows.map((r: any) => ({
    version: r.version,
    createdAt: r.createdAt,
    publishedByName: r.publishedByName ?? null,
    // A malformed snapshot makes the JSON functions return null rather than
    // fail the whole listing — the version is still there and still
    // restorable, so it must still be listed.
    blockCount: r.blockCount ?? 0,
    seoTitle: r.seoTitle ?? null,
    // Una página restablecida (resetSitePage) no sirve ninguna versión.
    isCurrent: page.publishedJson != null && r.version === page.version,
  }))
}

/**
 * Copies a published snapshot back over the **draft**, and only the draft.
 *
 * Deliberately not a "republish": restoring puts the old page back on the
 * editor's desk so it can be looked at (and, if it's the wrong one, undone)
 * before it reaches the public site. Until Publish is pressed, visitors keep
 * seeing whatever was already published — including the broken version being
 * recovered from, which is the honest state of the world.
 *
 * Returns the restored document so the caller can hand it straight back to
 * the builder without a second round-trip.
 */
export async function restorePageVersion(
  db: any,
  orgIdInput: number | null,
  pageKey: string,
  version: number,
): Promise<SitePageDocument> {
  const page = await getOrCreateSitePage(db, orgIdInput, pageKey)
  const rows = await db
    .select({ snapshotJson: schema.sitePageVersions.snapshotJson })
    .from(schema.sitePageVersions)
    .where(and(eq(schema.sitePageVersions.pageId, page.id), eq(schema.sitePageVersions.version, version)))
    .limit(1)

  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Esa versión no existe en esta página' })

  const doc = parsePageJson(rows[0].snapshotJson)
  await db
    .update(schema.sitePages)
    .set({ draftJson: JSON.stringify(doc), updatedAt: now() })
    .where(and(eq(schema.sitePages.organizationId, page.organizationId), eq(schema.sitePages.pageKey, pageKey)))

  return doc
}

export interface PublishedSitePage extends SitePageDocument {
  /**
   * Si la página tiene una versión publicada. Sin ella, las páginas que ya
   * existían en la web (Nosotros, Contacto, Propiedades…) siguen con su
   * contenido de siempre, y Servicios no existe todavía.
   */
  published: boolean
}

/** Public read: only ever the published document, for the resolved tenant. Never falls back to draft. */
export async function getPublishedPage(db: any, orgIdInput: number | null, pageKey: string): Promise<PublishedSitePage> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select({ publishedJson: schema.sitePages.publishedJson })
    .from(schema.sitePages)
    .where(and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, pageKey)))
    .limit(1)
  return { ...parsePageJson(rows[0]?.publishedJson), published: rows[0]?.publishedJson != null }
}

/**
 * «Volver a la página original»: el borrador vuelve a la siembra y la web
 * deja de servir lo publicado (vuelve al contenido de siempre de esa
 * dirección). Las versiones publicadas se conservan en el historial y se
 * pueden restaurar. La portada no: sin versión publicada se quedaría en
 * blanco, porque no tiene un contenido de siempre al que volver.
 */
export async function resetSitePage(db: any, orgIdInput: number | null, pageKey: string): Promise<SitePageDocument> {
  if (sitePageDef(pageKey)?.kind === 'home') {
    throw createError({ statusCode: 422, statusMessage: 'La portada no tiene una versión original a la que volver' })
  }
  const page = await getOrCreateSitePage(db, orgIdInput, pageKey)
  const doc = seedPageDocument(pageKey)
  await db
    .update(schema.sitePages)
    .set({ draftJson: JSON.stringify(doc), publishedJson: null, publishedAt: null, updatedAt: now() })
    .where(and(eq(schema.sitePages.organizationId, page.organizationId), eq(schema.sitePages.pageKey, pageKey)))
  return doc
}

export interface SitePageStatus {
  pageKey: string
  /** Hay una versión publicada sirviéndose en la web. */
  published: boolean
  version: number
  publishedAt: string | null
  /** El borrador difiere de lo publicado (o hay borrador y nada publicado). */
  hasUnpublishedChanges: boolean
  /** Nunca se ha abierto en el editor: su borrador aún no existe. */
  untouched: boolean
}

/**
 * El estado de cada página del catálogo para el panel «Páginas» del editor,
 * en una sola lectura y sin crear filas: una página que nadie ha abierto
 * todavía sigue sin fila hasta que se abre.
 */
export async function listSitePageStatuses(db: any, orgIdInput: number | null): Promise<SitePageStatus[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select({
      pageKey: schema.sitePages.pageKey,
      draftJson: schema.sitePages.draftJson,
      publishedJson: schema.sitePages.publishedJson,
      version: schema.sitePages.version,
      publishedAt: schema.sitePages.publishedAt,
    })
    .from(schema.sitePages)
    .where(eq(schema.sitePages.organizationId, orgId))
  const byKey = new Map<string, any>(rows.map((r: any) => [r.pageKey, r]))
  return SITE_PAGES.map((def) => {
    const row = byKey.get(def.key)
    if (!row) return { pageKey: def.key, published: false, version: 0, publishedAt: null, hasUnpublishedChanges: false, untouched: true }
    const draft = parsePageJson(row.draftJson)
    const published = row.publishedJson != null ? parsePageJson(row.publishedJson) : null
    return {
      pageKey: def.key,
      published: published != null,
      version: row.version || 0,
      publishedAt: row.publishedJson != null ? row.publishedAt : null,
      hasUnpublishedChanges: JSON.stringify(draft) !== JSON.stringify(published),
      untouched: false,
    }
  })
}

const MAX_BLOCKS = 200
const MAX_JSON_BYTES = 500_000

/**
 * Validates the shape the builder is allowed to write — not what each block
 * `type` means (that's the renderer/editor's job), just that this is a well-formed
 * page document and not, say, a client bug sending `undefined` or a string.
 * Thrown errors are 422s the builder's autosave surfaces as "no se pudo guardar".
 */
export function validatePageDocument(input: unknown, pageKey?: string): SitePageDocument {
  if (!input || typeof input !== 'object') {
    throw createError({ statusCode: 422, statusMessage: 'Página inválida' })
  }
  const raw = input as Record<string, any>
  if (!Array.isArray(raw.blocks)) {
    throw createError({ statusCode: 422, statusMessage: 'blocks debe ser un array' })
  }
  if (raw.blocks.length > MAX_BLOCKS) {
    throw createError({ statusCode: 422, statusMessage: `Máximo ${MAX_BLOCKS} bloques por página` })
  }

  const seenIds = new Set<string>()
  const blocks: SiteBlock[] = raw.blocks.map((b: any, i: number) => {
    if (!b || typeof b !== 'object') throw createError({ statusCode: 422, statusMessage: `Bloque #${i} inválido` })
    const id = String(b.id || '')
    const type = String(b.type || '')
    if (!id || !type) throw createError({ statusCode: 422, statusMessage: `Bloque #${i}: id y type son obligatorios` })
    if (seenIds.has(id)) throw createError({ statusCode: 422, statusMessage: `Id de bloque duplicado: ${id}` })
    seenIds.add(id)
    const block: SiteBlock = {
      id,
      type,
      version: Number.isInteger(b.version) ? b.version : 1,
      content: b.content && typeof b.content === 'object' ? b.content : {},
      style: b.style && typeof b.style === 'object' ? b.style : undefined,
      visibility: b.visibility && typeof b.visibility === 'object' ? b.visibility : undefined,
    }
    // Sanitised, never passed through: an unknown property or an
    // out-of-range value is dropped here, so the stylesheet built from the
    // saved JSON only ever contains what utils/siteBuilder/nodes.ts allows.
    const nodeStyles = sanitizeNodeStyles(b.nodeStyles)
    if (nodeStyles) block.nodeStyles = nodeStyles
    return block
  })

  // La zona dinámica de una página funcional (utils/siteBuilder/pages.ts):
  // exactamente una, la de esa página, sin contenido ni opciones propias
  // (no hay nada que editar en ella: se rellena sola). En el resto de
  // páginas no puede haber ninguna.
  if (pageKey) {
    const def = sitePageDef(pageKey)
    const cores = blocks.filter((b) => b.type === PAGE_CORE_TYPE)
    if (def?.kind === 'functional') {
      if (cores.length !== 1) throw createError({ statusCode: 422, statusMessage: 'La zona dinámica de esta página no se puede quitar ni repetir' })
      const core = cores[0]
      if (core.content.core !== def.core) throw createError({ statusCode: 422, statusMessage: 'Zona dinámica de otra página' })
      core.content = { core: def.core }
      delete core.style
      delete core.visibility
      delete core.nodeStyles
    } else if (cores.length) {
      throw createError({ statusCode: 422, statusMessage: 'Esta página no tiene zona dinámica' })
    }
  }

  const seo: SitePageSeo = {}
  if (raw.seo && typeof raw.seo === 'object') {
    if (raw.seo.title !== undefined) seo.title = String(raw.seo.title).slice(0, 200)
    if (raw.seo.description !== undefined) seo.description = String(raw.seo.description).slice(0, 500)
  }

  const doc: SitePageDocument = { blocks, seo }
  const styles = sanitizeGlobalStyles(raw.styles)
  if (styles) doc.styles = styles
  if (JSON.stringify(doc).length > MAX_JSON_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Página demasiado grande' })
  }
  return doc
}

/** Sólo las páginas del catálogo (utils/siteBuilder/pages.ts); cualquier otra clave es un 404. */
export function requireValidPageKey(pageKey: string | undefined | null): string {
  const key = String(pageKey || '')
  if (!SITE_PAGE_KEYS.includes(key)) {
    throw createError({ statusCode: 404, statusMessage: 'Página no encontrada' })
  }
  return key
}

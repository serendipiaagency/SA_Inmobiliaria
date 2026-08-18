import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from './db'

/**
 * The Constructor Web's data model. A page is a flat, ordered array of
 * blocks — array position IS block order, there is no separate `order`
 * field to keep in sync with it.
 *
 * `content` is intentionally untyped here: each block `type` owns its own
 * content shape (see components/site-builder/blocks/*.vue and the matching
 * editors). This file only knows how to read/write the envelope, never what
 * a specific block means.
 */
export interface SiteBlock {
  id: string
  type: string
  version: number
  content: Record<string, any>
  style?: Record<string, any>
  /** Per-breakpoint visibility. Missing = visible everywhere. */
  visibility?: { desktop?: boolean; tablet?: boolean; mobile?: boolean }
}

export interface SitePageSeo {
  title?: string
  description?: string
}

export interface SitePageDocument {
  blocks: SiteBlock[]
  seo: SitePageSeo
}

export const DEFAULT_PAGE_KEY = 'home'

export const EMPTY_PAGE: SitePageDocument = { blocks: [], seo: {} }

export function parsePageJson(json: string | null | undefined): SitePageDocument {
  if (!json) return { blocks: [], seo: {} }
  try {
    const parsed = JSON.parse(json)
    return {
      blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      seo: parsed?.seo && typeof parsed.seo === 'object' ? parsed.seo : {},
    }
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
  const seedJson = JSON.stringify(EMPTY_PAGE)
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

/** Public read: only ever the published document, for the resolved tenant. Never falls back to draft. */
export async function getPublishedPage(db: any, orgIdInput: number | null, pageKey: string): Promise<SitePageDocument> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select({ publishedJson: schema.sitePages.publishedJson })
    .from(schema.sitePages)
    .where(and(eq(schema.sitePages.organizationId, orgId), eq(schema.sitePages.pageKey, pageKey)))
    .limit(1)
  return parsePageJson(rows[0]?.publishedJson)
}

const MAX_BLOCKS = 200
const MAX_JSON_BYTES = 500_000

/**
 * Validates the shape the builder is allowed to write — not what each block
 * `type` means (that's the renderer/editor's job), just that this is a well-formed
 * page document and not, say, a client bug sending `undefined` or a string.
 * Thrown errors are 422s the builder's autosave surfaces as "no se pudo guardar".
 */
export function validatePageDocument(input: unknown): SitePageDocument {
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
    return {
      id,
      type,
      version: Number.isInteger(b.version) ? b.version : 1,
      content: b.content && typeof b.content === 'object' ? b.content : {},
      style: b.style && typeof b.style === 'object' ? b.style : undefined,
      visibility: b.visibility && typeof b.visibility === 'object' ? b.visibility : undefined,
    }
  })

  const seo: SitePageSeo = {}
  if (raw.seo && typeof raw.seo === 'object') {
    if (raw.seo.title !== undefined) seo.title = String(raw.seo.title).slice(0, 200)
    if (raw.seo.description !== undefined) seo.description = String(raw.seo.description).slice(0, 500)
  }

  const doc: SitePageDocument = { blocks, seo }
  if (JSON.stringify(doc).length > MAX_JSON_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Página demasiado grande' })
  }
  return doc
}

export function requireValidPageKey(pageKey: string | undefined | null): string {
  const key = String(pageKey || '')
  // Multi-page is designed for but not built yet — 'home' is the only real key today.
  if (key !== DEFAULT_PAGE_KEY) {
    throw createError({ statusCode: 404, statusMessage: 'Página no encontrada' })
  }
  return key
}

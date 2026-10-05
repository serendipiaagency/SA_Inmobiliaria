import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { findOwnedMediaAsset, restoreMediaAssetByKey, softDeleteMediaAsset } from '../mediaAssets'
import { selectInChunks } from '../sqlChunks'
import { assertLiveProperty } from './trash'
import {
  MEDIA_LANGUAGES,
  MEDIA_TEXT_LIMITS,
  PROPERTY_MEDIA_SOURCES,
  PROPERTY_MEDIA_TYPES,
  isPublicMediaRow,
  type PropertyMediaType,
} from '../../../utils/propertyMediaCatalog'

/**
 * Multimedia de una propiedad (FASE 7, bloque N7a): vídeos, tours virtuales,
 * renders, PDF, drone y 360 (`property_media`), y los metadatos por recurso
 * de las fotos de galería de los dos catálogos (`images` en obra nueva,
 * `property_gallery_images` en 2ª mano) — tipo, título, alt, pie, idioma,
 * publicable, privado y oculto.
 *
 * Todo pasa por el motor CRUD genérico (`property-media`, `project-images`,
 * `gallery-images` en adminResources.ts): sin rutas nuevas. Los ficheros se
 * suben con las subidas que ya existen (`/api/admin/upload` para imágenes y
 * PDF, la subida por partes para vídeo) y quedan registrados en
 * `media_assets`, que es lo que decide quién puede leerlos.
 *
 * Borrar una foto o un recurso ya no deja huérfanos: si el fichero no lo usa
 * ninguna otra ficha de la agencia (una copia duplicada, la portada…), su
 * `media_assets` se borra con el mecanismo de siempre (`softDeleteMediaAsset`:
 * deja de servirse y de contar en la cuota al momento, y el cron
 * `media-lifecycle` borra el objeto de R2 tras el periodo de gracia).
 */

type PropertyKind = 'agent' | 'developer'

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

/** Lo que guarda una columna de imagen: la clave R2, `/api/media/<clave>` o un enlace externo. */
export function mediaKeyFromValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return null
  const key = v.replace(/^\/api\/media\//, '')
  if (!key || key.includes('..')) return null
  return key
}

function cleanText(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.length > max) fail(422, `${label}: como máximo ${max} caracteres`)
  return s
}

function flag(value: unknown): number {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}

/**
 * Normaliza los metadatos por recurso que trae un cuerpo (sólo los presentes):
 * textos con su límite, idioma del catálogo y los tres interruptores a 0/1.
 * Lo usan las fotos de galería (`prepare` del recurso) y `property-media`.
 */
export function normalizeMediaMetadata(data: Record<string, any>): Record<string, any> {
  if ('title' in data) data.title = cleanText(data.title, MEDIA_TEXT_LIMITS.title, 'Título')
  if ('alt' in data) data.alt = cleanText(data.alt, MEDIA_TEXT_LIMITS.alt, 'Texto alternativo')
  if ('caption' in data) data.caption = cleanText(data.caption, MEDIA_TEXT_LIMITS.caption, 'Pie de foto')
  if ('language' in data) {
    const lang = data.language === null || data.language === undefined || data.language === '' ? null : String(data.language)
    if (lang && !(MEDIA_LANGUAGES as readonly string[]).includes(lang)) fail(422, 'Idioma no válido')
    data.language = lang
  }
  for (const k of ['isPublishable', 'isPrivate', 'isHidden']) if (k in data && data[k] !== null) data[k] = flag(data[k])
  if ('isPublishable' in data && data.isPublishable === null) data.isPublishable = 1
  if ('isPrivate' in data && data.isPrivate === null) data.isPrivate = 0
  if ('isHidden' in data && data.isHidden === null) data.isHidden = 0
  if ('sortOrder' in data && data.sortOrder !== null) {
    const n = Number(data.sortOrder)
    if (!Number.isInteger(n) || n < 0 || n > 100000) fail(422, 'Orden no válido')
    data.sortOrder = n
  }
  return data
}

function assertKind(kind: unknown): PropertyKind {
  if (kind !== 'agent' && kind !== 'developer') fail(422, 'propertyKind debe ser "agent" (2ª mano) o "developer" (web)')
  return kind
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Valida un alta o edición de `property-media`: propiedad de la agencia (y
 * viva si el recurso es nuevo o cambia de propiedad), tipo del catálogo, una
 * fuente que ese tipo admite (enlace `https://` o un fichero subido por esta
 * misma agencia con el formato que toca), metadatos y un único «principal»
 * por tipo. El fichero se comprueba contra `media_assets`, nunca por la forma
 * de la clave.
 */
export async function validatePropertyMedia(db: any, orgId: number, data: Record<string, any>, existing: Record<string, any> | null): Promise<void> {
  const merged = { ...(existing || {}), ...data }
  const kind = assertKind(merged.propertyKind)
  const propertyId = Number(merged.propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) fail(422, 'Falta la propiedad')
  const sameProperty = !!existing && existing.propertyKind === kind && Number(existing.propertyId) === propertyId
  if (!sameProperty) await assertLiveProperty(db, orgId, kind, propertyId, { action: 'añadirle multimedia' })
  else {
    const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
    const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, propertyId), eq(t.organizationId, orgId))).limit(1)
    if (!row) fail(404, 'Propiedad no encontrada')
  }

  const mediaType = String(merged.mediaType || '') as PropertyMediaType
  if (!(PROPERTY_MEDIA_TYPES as readonly string[]).includes(mediaType)) fail(422, 'Tipo de recurso no válido')
  const sources = PROPERTY_MEDIA_SOURCES[mediaType]

  if ('url' in data) data.url = typeof data.url === 'string' && data.url.trim() ? data.url.trim() : null
  if ('r2Key' in data) data.r2Key = mediaKeyFromValue(data.r2Key)
  const url = 'url' in data ? data.url : (existing?.url ?? null)
  const r2Key = 'r2Key' in data ? data.r2Key : (existing?.r2Key ?? null)
  if (url && r2Key) fail(422, 'Un recurso es un enlace o un fichero subido, no las dos cosas')
  if (!url && !r2Key) fail(422, 'Falta el enlace o el fichero del recurso')
  if (url) {
    if (!sources.includes('url')) fail(422, 'Este tipo de recurso necesita un fichero subido, no un enlace')
    if (url.length > 2000 || !isHttpsUrl(url)) fail(422, 'El enlace tiene que empezar por https://')
  }
  if (r2Key && (!existing || existing.r2Key !== r2Key)) {
    const asset = await findOwnedMediaAsset(db, orgId, r2Key)
    // Un fichero de otra agencia (o que no existe) es una referencia ajena: 404.
    if (!asset) fail(404, 'Fichero no encontrado')
    const mime = String(asset.mimeType || '')
    const kindOfFile = mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : null
    if (!kindOfFile || !sources.includes(kindOfFile)) fail(422, `Este tipo de recurso no admite un fichero ${mime || 'desconocido'}`)
  }

  normalizeMediaMetadata(data)
  if ('isMain' in data && data.isMain !== null) data.isMain = flag(data.isMain)
}

/** Un único recurso «principal» por propiedad y tipo: marcar uno desmarca el resto. */
export async function enforceSingleMainMedia(db: any, orgId: number, row: { id: number; propertyKind: string; propertyId: number; mediaType: string; isMain: number }): Promise<void> {
  if (!row.isMain) return
  await db
    .update(schema.propertyMedia)
    .set({ isMain: 0, updatedAt: now() })
    .where(
      and(
        eq(schema.propertyMedia.organizationId, orgId),
        eq(schema.propertyMedia.propertyKind, row.propertyKind),
        eq(schema.propertyMedia.propertyId, row.propertyId),
        eq(schema.propertyMedia.mediaType, row.mediaType),
        sql`${schema.propertyMedia.id} <> ${row.id}`,
      ),
    )
}

// ---------------------------------------------------------------------------
// Referencias a un fichero dentro de la agencia
// ---------------------------------------------------------------------------

/** Columnas de imagen/fichero de la fila de cada catálogo (las que puede compartir una foto de galería). */
const DEVELOPER_FILE_COLUMNS = ['coverImage', 'logo', 'masterPlanImage', 'locationMap', 'dronePhoto', 'nightPhoto', 'beforePhoto', 'afterPhoto', 'aiStagedPhoto', 'videoUrl'] as const
const AGENT_FILE_COLUMNS = ['mainImage', 'dronePhoto', 'nightPhoto', 'beforePhoto', 'afterPhoto', 'aiStagedPhoto', 'videoUrl'] as const

export const PROPERTY_FILE_COLUMNS: Record<PropertyKind, readonly string[]> = { developer: DEVELOPER_FILE_COLUMNS, agent: AGENT_FILE_COLUMNS }

/** Las dos formas en que una columna puede guardar la misma clave. */
function valueVariants(key: string): string[] {
  return [key, `/api/media/${key}`]
}

export interface MediaKeyReference {
  source: 'gallery' | 'property' | 'property-media' | 'floor-plan'
  isPrivate: boolean
}

/**
 * Dónde se usa un fichero DENTRO de esta agencia: fotos de galería de los dos
 * catálogos, columnas de imagen de las propiedades (portada, foto aérea…),
 * planos y `property_media` vivos. Una copia duplicada de una promoción
 * comparte las claves de su galería con el original, y «Usar como portada»
 * reutiliza la de una foto: borrar una de esas filas no puede llevarse el
 * fichero de la otra.
 */
export async function findMediaKeyReferences(db: any, orgId: number, key: string, exclude: { table?: 'images' | 'gallery' | 'property-media'; id?: number } = {}): Promise<MediaKeyReference[]> {
  const variants = valueVariants(key)
  const refs: MediaKeyReference[] = []
  const D = schema.developerProperties
  const A = schema.agentProperties

  const devImages = await db
    .select({ id: schema.images.id, isPrivate: schema.images.isPrivate })
    .from(schema.images)
    .innerJoin(D, and(eq(D.id, schema.images.developerPropertyId), eq(D.organizationId, orgId)))
    .where(inArray(schema.images.image, variants))
  for (const r of devImages) if (!(exclude.table === 'images' && r.id === exclude.id)) refs.push({ source: 'gallery', isPrivate: !!r.isPrivate })

  const agentImages = await db
    .select({ id: schema.propertyGalleryImages.id, isPrivate: schema.propertyGalleryImages.isPrivate })
    .from(schema.propertyGalleryImages)
    .innerJoin(A, and(eq(A.id, schema.propertyGalleryImages.propertyId), eq(A.organizationId, orgId)))
    .where(inArray(schema.propertyGalleryImages.image, variants))
  for (const r of agentImages) if (!(exclude.table === 'gallery' && r.id === exclude.id)) refs.push({ source: 'gallery', isPrivate: !!r.isPrivate })

  const media = await db
    .select({ id: schema.propertyMedia.id, isPrivate: schema.propertyMedia.isPrivate })
    .from(schema.propertyMedia)
    .where(and(eq(schema.propertyMedia.organizationId, orgId), inArray(schema.propertyMedia.r2Key, variants), isNull(schema.propertyMedia.deletedAt)))
  for (const r of media) if (!(exclude.table === 'property-media' && r.id === exclude.id)) refs.push({ source: 'property-media', isPrivate: !!r.isPrivate })

  const devCols = DEVELOPER_FILE_COLUMNS.map((c) => inArray((D as any)[c], variants))
  const devRows = await db.select({ id: D.id }).from(D).where(and(eq(D.organizationId, orgId), or(...devCols))).limit(1)
  if (devRows.length) refs.push({ source: 'property', isPrivate: false })
  const agentCols = AGENT_FILE_COLUMNS.map((c) => inArray((A as any)[c], variants))
  const agentRows = await db.select({ id: A.id }).from(A).where(and(eq(A.organizationId, orgId), or(...agentCols))).limit(1)
  if (agentRows.length) refs.push({ source: 'property', isPrivate: false })

  const plans = await db
    .select({ id: schema.floorPlans.id })
    .from(schema.floorPlans)
    .innerJoin(D, and(eq(D.id, schema.floorPlans.developerPropertyId), eq(D.organizationId, orgId)))
    .where(inArray(schema.floorPlans.image, variants))
    .limit(1)
  const agentPlans = await db
    .select({ id: schema.agentPropertyFloorPlans.id })
    .from(schema.agentPropertyFloorPlans)
    .innerJoin(A, and(eq(A.id, schema.agentPropertyFloorPlans.propertyId), eq(A.organizationId, orgId)))
    .where(inArray(schema.agentPropertyFloorPlans.image, variants))
    .limit(1)
  if (plans.length || agentPlans.length) refs.push({ source: 'floor-plan', isPrivate: false })

  return refs
}

/**
 * Libera el fichero de una fila que se acaba de borrar si ya nadie de la
 * agencia lo usa: su `media_assets` pasa a borrado (deja de servirse y de
 * contar en la cuota) y el cron `media-lifecycle` borra el objeto de R2 tras
 * el periodo de gracia — el mismo mecanismo que la Papelera del CMS. Un
 * fichero de otra agencia, un enlace externo o una clave sin registro (un
 * objeto anterior al Media Asset Manager) no se tocan.
 *
 * Devuelve `true` si el fichero se liberó.
 */
export async function releaseMediaKeyIfUnreferenced(db: any, orgId: number, value: unknown): Promise<boolean> {
  const key = mediaKeyFromValue(value)
  if (!key) return false
  const asset = await findOwnedMediaAsset(db, orgId, key)
  if (!asset) return false
  const refs = await findMediaKeyReferences(db, orgId, key)
  if (refs.length) return false
  await softDeleteMediaAsset(db, asset.id)
  return true
}

/**
 * «Privado» de verdad: el fichero de un recurso marcado privado deja de
 * servirse sin sesión (`media_assets.visibility = private` → sólo el panel de
 * esta agencia). Vuelve a `public` en cuanto alguna referencia viva de la
 * agencia lo necesita público (otra foto, la portada…). Sólo toca los
 * ficheros de ESTA agencia y nunca los de otra categoría (un documento legal
 * no se vuelve público por compartir clave, cosa que no ocurre, pero se
 * comprueba igual).
 */
export async function syncMediaKeyVisibility(db: any, orgId: number, value: unknown): Promise<'public' | 'private' | null> {
  const key = mediaKeyFromValue(value)
  if (!key) return null
  const asset = await findOwnedMediaAsset(db, orgId, key)
  if (!asset || (asset.visibility !== 'public' && asset.visibility !== 'private')) return null
  if (asset.category !== 'property-photo' && asset.category !== 'property-video') return null
  const refs = await findMediaKeyReferences(db, orgId, key)
  const wanted: 'public' | 'private' = refs.length > 0 && refs.every((r) => r.isPrivate) ? 'private' : 'public'
  if (asset.visibility !== wanted) {
    await db.update(schema.mediaAssets).set({ visibility: wanted, updatedAt: now() }).where(and(eq(schema.mediaAssets.id, asset.id), eq(schema.mediaAssets.organizationId, orgId)))
  }
  return wanted
}

/** Papelera de un recurso de `property-media`: su fichero deja de servirse (y de contar) mientras esté allí. */
export async function trashPropertyMediaFile(db: any, orgId: number, row: { id: number; r2Key: string | null }): Promise<void> {
  const key = mediaKeyFromValue(row.r2Key)
  if (!key) return
  const asset = await findOwnedMediaAsset(db, orgId, key)
  if (!asset) return
  const refs = await findMediaKeyReferences(db, orgId, key, { table: 'property-media', id: row.id })
  if (!refs.length) await softDeleteMediaAsset(db, asset.id)
}

/** Restaurar un recurso de la papelera: su fichero vuelve, salvo que el cron ya lo haya purgado (409). */
export async function restorePropertyMediaFile(db: any, orgId: number, row: { r2Key: string | null }): Promise<void> {
  const key = mediaKeyFromValue(row.r2Key)
  if (!key) return
  const [asset] = await db
    .select({ id: schema.mediaAssets.id, purgedAt: schema.mediaAssets.purgedAt })
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.r2Key, key), eq(schema.mediaAssets.organizationId, orgId)))
    .limit(1)
  if (!asset) return
  if (asset.purgedAt) fail(409, 'El fichero de este recurso ya se borró definitivamente del almacenamiento: no se puede restaurar.')
  await restoreMediaAssetByKey(db, key)
}

/**
 * Borrar definitivamente una propiedad (Papelera → «Eliminar
 * definitivamente»): las fotos y planos se van por la cascada de la base de
 * datos, pero sus ficheros, los de `property_media` y los documentos no
 * tienen FK. Se recogen ANTES del borrado (`collectPropertyFileKeys`) y se
 * liberan DESPUÉS (`releasePropertyFiles`), cuando ya no hay fila que los use.
 */
export async function collectPropertyFileKeys(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<string[]> {
  const keys: unknown[] = []
  if (kind === 'developer') {
    const [row] = await db.select().from(schema.developerProperties).where(and(eq(schema.developerProperties.id, propertyId), eq(schema.developerProperties.organizationId, orgId))).limit(1)
    if (!row) return []
    for (const c of DEVELOPER_FILE_COLUMNS) keys.push((row as any)[c])
    keys.push(...(await db.select({ v: schema.images.image }).from(schema.images).where(eq(schema.images.developerPropertyId, propertyId))).map((r: any) => r.v))
    keys.push(...(await db.select({ v: schema.floorPlans.image }).from(schema.floorPlans).where(eq(schema.floorPlans.developerPropertyId, propertyId))).map((r: any) => r.v))
  } else {
    const [row] = await db.select().from(schema.agentProperties).where(and(eq(schema.agentProperties.id, propertyId), eq(schema.agentProperties.organizationId, orgId))).limit(1)
    if (!row) return []
    for (const c of AGENT_FILE_COLUMNS) keys.push((row as any)[c])
    keys.push(...(await db.select({ v: schema.propertyGalleryImages.image }).from(schema.propertyGalleryImages).where(eq(schema.propertyGalleryImages.propertyId, propertyId))).map((r: any) => r.v))
    keys.push(...(await db.select({ v: schema.agentPropertyFloorPlans.image }).from(schema.agentPropertyFloorPlans).where(eq(schema.agentPropertyFloorPlans.propertyId, propertyId))).map((r: any) => r.v))
  }
  const media = await db
    .select({ v: schema.propertyMedia.r2Key })
    .from(schema.propertyMedia)
    .where(and(eq(schema.propertyMedia.organizationId, orgId), eq(schema.propertyMedia.propertyKind, kind), eq(schema.propertyMedia.propertyId, propertyId)))
  keys.push(...media.map((r: any) => r.v))
  return [...new Set(keys.map(mediaKeyFromValue).filter((k): k is string => !!k))]
}

export async function releasePropertyFiles(db: any, orgId: number, kind: PropertyKind, propertyId: number, keys: string[]): Promise<number> {
  // Las filas de property_media de la propiedad borrada ya no tienen a qué colgarse.
  await db
    .delete(schema.propertyMedia)
    .where(and(eq(schema.propertyMedia.organizationId, orgId), eq(schema.propertyMedia.propertyKind, kind), eq(schema.propertyMedia.propertyId, propertyId)))
  let released = 0
  for (const key of keys) if (await releaseMediaKeyIfUnreferenced(db, orgId, key)) released++
  return released
}

// ---------------------------------------------------------------------------
// Lectura pública (web y portales)
// ---------------------------------------------------------------------------

export interface PublicGalleryImage {
  id: number
  image: string
  sortOrder: number
  title: string | null
  alt: string | null
  caption: string | null
  language: string | null
}

/**
 * Las fotos de galería que pueden salir fuera del panel: publicables, no
 * privadas y no ocultas, en su orden. Es lo único que leen la ficha pública,
 * las tarjetas (`attachPhotos`) y el listado que se entrega a un portal.
 */
export async function listPublicGallery(db: any, kind: PropertyKind, propertyIds: number[]): Promise<Map<number, PublicGalleryImage[]>> {
  const out = new Map<number, PublicGalleryImage[]>()
  if (!propertyIds.length) return out
  const T = kind === 'developer' ? schema.images : schema.propertyGalleryImages
  const parent = kind === 'developer' ? schema.images.developerPropertyId : schema.propertyGalleryImages.propertyId
  const rows = await selectInChunks(propertyIds, (part) =>
    db
      .select({ id: T.id, pid: parent, image: T.image, sortOrder: T.sortOrder, title: T.title, alt: T.alt, caption: T.caption, language: T.language })
      .from(T)
      .where(and(inArray(parent, part), eq(T.isPublishable, 1), eq(T.isPrivate, 0), eq(T.isHidden, 0)))
      .orderBy(asc(T.sortOrder), asc(T.id)),
  )
  for (const r of rows as any[]) {
    const { pid, ...img } = r
    ;(out.get(pid) || out.set(pid, []).get(pid)!).push(img)
  }
  for (const list of out.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return out
}

export interface PublicPropertyMedia {
  id: number
  mediaType: string
  url: string
  isFile: boolean
  title: string | null
  alt: string | null
  caption: string | null
  language: string | null
  isMain: boolean
  sortOrder: number
}

/** Los recursos de `property_media` publicables (no privados, no ocultos, no en la papelera), con su URL lista para usar. */
export async function listPublicPropertyMedia(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<PublicPropertyMedia[]> {
  const rows = await db
    .select()
    .from(schema.propertyMedia)
    .where(
      and(
        eq(schema.propertyMedia.organizationId, orgId),
        eq(schema.propertyMedia.propertyKind, kind),
        eq(schema.propertyMedia.propertyId, propertyId),
        isNull(schema.propertyMedia.deletedAt),
        eq(schema.propertyMedia.isPublishable, 1),
        eq(schema.propertyMedia.isPrivate, 0),
        eq(schema.propertyMedia.isHidden, 0),
      ),
    )
    .orderBy(asc(schema.propertyMedia.sortOrder), asc(schema.propertyMedia.id))
  return rows
    .filter((r: any) => isPublicMediaRow(r))
    .map((r: any) => ({
      id: r.id,
      mediaType: r.mediaType,
      url: r.r2Key ? `/api/media/${r.r2Key}` : String(r.url || ''),
      isFile: !!r.r2Key,
      title: r.title,
      alt: r.alt,
      caption: r.caption,
      language: r.language,
      isMain: !!r.isMain,
      sortOrder: r.sortOrder,
    }))
    .filter((m: PublicPropertyMedia) => !!m.url)
}

/** Recuento de la multimedia de una propiedad para el resumen de la ficha (todo, publicable o no). */
export async function propertyMediaCounts(db: any, orgId: number, kind: PropertyKind, propertyId: number) {
  const T = kind === 'developer' ? schema.images : schema.propertyGalleryImages
  const parent = kind === 'developer' ? schema.images.developerPropertyId : schema.propertyGalleryImages.propertyId
  const photos = await db.select({ isPublishable: T.isPublishable, isPrivate: T.isPrivate, isHidden: T.isHidden }).from(T).where(eq(parent, propertyId))
  const media = await db
    .select({ mediaType: schema.propertyMedia.mediaType, isPublishable: schema.propertyMedia.isPublishable, isPrivate: schema.propertyMedia.isPrivate, isHidden: schema.propertyMedia.isHidden })
    .from(schema.propertyMedia)
    .where(and(eq(schema.propertyMedia.organizationId, orgId), eq(schema.propertyMedia.propertyKind, kind), eq(schema.propertyMedia.propertyId, propertyId), isNull(schema.propertyMedia.deletedAt)))
  const byType: Record<string, number> = {}
  for (const m of media) byType[m.mediaType] = (byType[m.mediaType] || 0) + 1
  return {
    photos: photos.length,
    publicPhotos: photos.filter((p: any) => isPublicMediaRow(p)).length,
    hiddenPhotos: photos.filter((p: any) => !!p.isHidden).length,
    privatePhotos: photos.filter((p: any) => !!p.isPrivate).length,
    media: media.length,
    publicMedia: media.filter((m: any) => isPublicMediaRow(m)).length,
    byType,
  }
}

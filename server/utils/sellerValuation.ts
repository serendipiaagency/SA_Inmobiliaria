import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { getRequestHeader, getQuery, readRawBody, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { cfEnv, now, resolvePublicOrgId, schema, useDb } from './db'
import { rateLimit } from './rateLimit'
import { registerMediaAsset } from './mediaAssets'
import { assertQuotaAvailable } from './mediaQuota'
import { SELLER_MAX_PHOTOS, SELLER_PHOTO_PREFIX } from '../../utils/sellerValuation'

/**
 * Fotos opcionales del formulario de valoración de «Vender propiedad»
 * (`POST /api/public/contact?channel=seller-photo&submissionId=…`: una rama del
 * endpoint de contacto, no una ruta nueva).
 *
 * Una persona anónima escribe en el almacenamiento de la agencia, así que
 * cada límite está aquí y no en el navegador: tipo comprobado por los bytes
 * (no por la cabecera), 5 MB por foto, 6 fotos por envío, un límite de tasa
 * por IP y la cuota de almacenamiento de la agencia. Las fotos quedan
 * PRIVADAS (sólo las abre el equipo de esa agencia con sesión, por
 * /api/media/…) y registradas en `media_assets`; al crear el lead se enlazan
 * a él. Una foto de un envío que nunca se completó se queda sin lead: el
 * mismo caso que cualquier otra subida sin terminar, para el barrido de
 * almacenamiento.
 */
export const SELLER_PHOTO_MAX_BYTES = 5 * 1024 * 1024
const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,64}$/
const PENDING_ENTITY = 'seller_submission'

type Sniffed = { mime: string; ext: string }

/** El tipo real de la imagen según sus primeros bytes. Nada de SVG ni de lo que un navegador pueda ejecutar. */
export function sniffImage(bytes: Uint8Array): Sniffed | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { mime: 'image/png', ext: 'png' }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

export function sellerPhotoPrefix(orgId: number, submissionId: string): string {
  return `${SELLER_PHOTO_PREFIX}${orgId}/${submissionId}/`
}

function randomName(): string {
  const b = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export async function handleSellerPhotoUpload(event: H3Event) {
  await rateLimit(event, 'seller-photo', { limit: 24, windowSeconds: 600 })
  const q = getQuery(event)
  const submissionId = typeof q.submissionId === 'string' ? q.submissionId : ''
  if (!SUBMISSION_ID.test(submissionId)) throw createError({ statusCode: 422, statusMessage: 'Envío no válido' })
  if (Number(getRequestHeader(event, 'content-length') || 0) > SELLER_PHOTO_MAX_BYTES + 1024) {
    throw createError({ statusCode: 413, statusMessage: 'La foto pesa más de 5 MB' })
  }
  const raw = await readRawBody(event, false)
  const bytes = raw ? new Uint8Array(raw) : new Uint8Array(0)
  if (!bytes.length) throw createError({ statusCode: 422, statusMessage: 'No hay foto' })
  if (bytes.length > SELLER_PHOTO_MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'La foto pesa más de 5 MB' })
  const kind = sniffImage(bytes)
  if (!kind) throw createError({ statusCode: 415, statusMessage: 'Sólo se admiten fotos JPG, PNG o WebP' })

  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  const prefix = sellerPhotoPrefix(orgId, submissionId)
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.mediaAssets).where(and(eq(schema.mediaAssets.organizationId, orgId), like(schema.mediaAssets.r2Key, `${prefix}%`)))
  if (Number(n) >= SELLER_MAX_PHOTOS) throw createError({ statusCode: 422, statusMessage: `Máximo ${SELLER_MAX_PHOTOS} fotos` })
  await assertQuotaAvailable(db, orgId, bytes.length)

  const key = `${prefix}${randomName()}.${kind.ext}`
  await cfEnv(event).MEDIA.put(key, bytes, { httpMetadata: { contentType: kind.mime } })
  await registerMediaAsset(db, {
    organizationId: orgId,
    r2Key: key,
    originalFilename: null,
    mimeType: kind.mime,
    extension: kind.ext,
    sizeBytes: bytes.length,
    visibility: 'private',
    category: 'upload',
    entityType: PENDING_ENTITY,
    entityId: null,
    metadata: { source: 'seller-valuation' },
  })
  setResponseStatus(event, 201)
  return { ok: true, key }
}

/** De las claves que llegan con el envío, sólo las que este envío subió de verdad a esta agencia. */
export async function ownedSellerPhotoKeys(db: any, orgId: number, submissionId: string | null, keys: string[]): Promise<string[]> {
  if (!submissionId || !SUBMISSION_ID.test(submissionId) || !keys.length) return []
  const prefix = sellerPhotoPrefix(orgId, submissionId)
  const wanted = [...new Set(keys.filter((k) => k.startsWith(prefix) && !k.includes('..')))].slice(0, SELLER_MAX_PHOTOS)
  if (!wanted.length) return []
  const rows = await db
    .select({ r2Key: schema.mediaAssets.r2Key })
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.organizationId, orgId), eq(schema.mediaAssets.entityType, PENDING_ENTITY), inArray(schema.mediaAssets.r2Key, wanted)))
  const ok = new Set<string>(rows.map((r: any) => r.r2Key))
  return wanted.filter((k) => ok.has(k))
}

/** Las fotos pasan a ser del lead: ya se pueden encontrar desde él. */
export async function linkSellerPhotos(db: any, orgId: number, leadId: number, keys: string[]): Promise<void> {
  if (!keys.length) return
  await db
    .update(schema.mediaAssets)
    .set({ entityType: 'lead', entityId: leadId, updatedAt: now() })
    .where(and(eq(schema.mediaAssets.organizationId, orgId), eq(schema.mediaAssets.entityType, PENDING_ENTITY), inArray(schema.mediaAssets.r2Key, keys)))
}


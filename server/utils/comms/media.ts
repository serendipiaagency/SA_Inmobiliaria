import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { sha256Hex } from '../checksum'
import { registerMediaAsset } from '../mediaAssets'
import { metaDownloadMedia } from './providers/metaCloud'
import { twilioDownloadMedia } from './providers/twilio'
import type { LoadedChannel } from './types'

/**
 * Medios de mensajes entrantes (fotos, documentos, audios). El webhook NO
 * los descarga —Meta y Twilio esperan una respuesta rápida—: sólo guarda la
 * referencia (id del medio de Meta, URL autenticada de Twilio) en
 * `payload_json`. La primera vez que alguien abre el archivo en el panel se
 * descarga con el token del canal, se guarda en R2 bajo el inquilino y se
 * registra en media_assets como `private` (sólo administradores de esa
 * organización, por /api/media). Las siguientes veces se sirve de R2.
 *
 * Meta conserva los medios 30 días: un archivo que nadie abrió en ese
 * tiempo ya no se puede recuperar, y el panel lo dice en vez de fingir.
 */

export const INBOUND_MEDIA_MAX_BYTES = 16 * 1024 * 1024

/** Tipos que se aceptan guardar. Nada ejecutable, nada SVG (ver docs/media-security-audit.md). */
export const INBOUND_MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'video/mp4': 'mp4',
}

function baseMime(mime: string | null | undefined): string {
  return String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
}

export interface EnsureMediaResult {
  ok: boolean
  key: string | null
  mime: string | null
  error: string | null
}

type MessageRow = typeof schema.commsMessages.$inferSelect

interface MediaRef {
  providerMediaId?: string | null
  url?: string | null
  mime?: string | null
  filename?: string | null
}

function mediaRefOf(payloadJson: string | null): MediaRef | null {
  try {
    return payloadJson ? (JSON.parse(payloadJson)?.media ?? null) : null
  } catch {
    return null
  }
}

/** Devuelve la clave R2 del medio de un mensaje entrante, descargándolo del proveedor la primera vez. */
export async function ensureInboundMedia(db: any, env: Record<string, any>, channel: LoadedChannel, message: MessageRow, fetchImpl: typeof fetch = fetch): Promise<EnsureMediaResult> {
  if (message.mediaKey) return { ok: true, key: message.mediaKey, mime: message.mediaMime, error: null }
  const ref = mediaRefOf(message.payloadJson)
  if (!ref) return { ok: false, key: null, mime: null, error: 'Este mensaje no tiene ningún archivo adjunto.' }

  let download: { ok: boolean; bytes: Uint8Array | null; mime: string | null; error: string | null }
  if (channel.provider === 'meta_cloud') {
    if (!ref.providerMediaId) return { ok: false, key: null, mime: null, error: 'El mensaje no trae el id del medio.' }
    download = await metaDownloadMedia(channel, env, ref.providerMediaId, fetchImpl)
  } else {
    if (!ref.url) return { ok: false, key: null, mime: null, error: 'El mensaje no trae la URL del medio.' }
    download = await twilioDownloadMedia(channel, ref.url, fetchImpl)
  }
  if (!download.ok || !download.bytes) return { ok: false, key: null, mime: null, error: download.error || 'No se pudo descargar el archivo del proveedor.' }

  const mime = baseMime(download.mime || ref.mime)
  const ext = INBOUND_MEDIA_TYPES[mime]
  if (!ext) return { ok: false, key: null, mime, error: `Tipo de archivo no admitido (${mime || 'desconocido'}).` }
  if (download.bytes.byteLength > INBOUND_MEDIA_MAX_BYTES) return { ok: false, key: null, mime, error: 'El archivo supera los 16 MB que el panel admite.' }
  if (download.bytes.byteLength === 0) return { ok: false, key: null, mime, error: 'El archivo está vacío.' }

  const key = `tenants/${message.organizationId}/comms/${crypto.randomUUID()}.${ext}`
  const bucket = env.MEDIA as R2Bucket | undefined
  if (!bucket) return { ok: false, key: null, mime, error: 'No hay almacenamiento (R2) disponible.' }
  await bucket.put(key, download.bytes as Uint8Array<ArrayBuffer>, { httpMetadata: { contentType: mime } })
  await registerMediaAsset(db, {
    organizationId: message.organizationId,
    r2Key: key,
    originalFilename: ref.filename ?? message.mediaFilename ?? null,
    mimeType: mime,
    extension: ext,
    sizeBytes: download.bytes.byteLength,
    checksum: await sha256Hex(download.bytes),
    visibility: 'private',
    category: 'upload',
    entityType: 'comms-message',
    entityId: message.id,
    createdBy: null,
  })
  await db.update(schema.commsMessages).set({ mediaKey: key, mediaMime: mime, updatedAt: now() }).where(eq(schema.commsMessages.id, message.id))
  return { ok: true, key, mime, error: null }
}

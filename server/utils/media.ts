import type { H3Event } from 'h3'
import { cfEnv } from './db'

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

/** Stores a multipart file part in R2 and returns its key (served at /api/media/<key>). */
export async function storeFile(
  event: H3Event,
  part: { data: Buffer | Uint8Array; type?: string; filename?: string },
  folder: string,
): Promise<string> {
  const type = part.type || 'application/octet-stream'
  const ext = ALLOWED_TYPES[type]
  if (!ext) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported file type: ${type}` })
  }
  if (part.data.byteLength > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'File too large (max 10 MB)' })
  }
  const id = crypto.randomUUID()
  const key = `${folder}/${id}.${ext}`
  await cfEnv(event).MEDIA.put(key, part.data as Uint8Array<ArrayBuffer>, {
    httpMetadata: { contentType: type },
  })
  return key
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/api/media/${key}` : null
}

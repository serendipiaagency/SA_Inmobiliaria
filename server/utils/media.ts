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

function bytesStartWith(data: Uint8Array, sig: number[], offset = 0): boolean {
  if (data.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (data[offset + i] !== sig[i]) return false
  return true
}

/**
 * Confirms the file's actual content matches its declared Content-Type via magic bytes,
 * instead of trusting the client-supplied header. A client can label any binary as
 * application/pdf; without this, that mislabeled file gets stored and later re-served
 * with the trusted Content-Type, which is how a stored-XSS payload (e.g. an HTML/SVG file
 * masquerading as a PDF) would slip through.
 */
function contentMatchesType(data: Uint8Array, type: string): boolean {
  switch (type) {
    case 'application/pdf':
      return bytesStartWith(data, [0x25, 0x50, 0x44, 0x46]) // %PDF
    case 'image/jpeg':
      return bytesStartWith(data, [0xff, 0xd8, 0xff])
    case 'image/png':
      return bytesStartWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || bytesStartWith(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    case 'image/webp':
      return bytesStartWith(data, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(data, [0x57, 0x45, 0x42, 0x50], 8) // RIFF....WEBP
    case 'image/svg+xml': {
      // SVG is XML text, not a binary signature — sniff the opening bytes and reject an
      // obvious <script> payload as a minimum bar. This path is admin-only (see storeFile
      // callers); the public visitor-docs upload restricts to application/pdf only.
      const head = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 512)).trimStart()
      const looksLikeSvg = /^(<\?xml|<svg)/i.test(head)
      const hasScript = /<script/i.test(head)
      return looksLikeSvg && !hasScript
    }
    default:
      return false
  }
}

/** Stores a multipart file part in R2 and returns its key (served at /api/media/<key>). */
export async function storeFile(
  event: H3Event,
  part: { data: Buffer | Uint8Array; type?: string; filename?: string },
  folder: string,
  allowedTypes: Record<string, string> = ALLOWED_TYPES,
): Promise<string> {
  const type = part.type || 'application/octet-stream'
  const ext = allowedTypes[type]
  if (!ext) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported file type: ${type}` })
  }
  if (part.data.byteLength > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'File too large (max 10 MB)' })
  }
  if (!contentMatchesType(part.data as Uint8Array, type)) {
    throw createError({ statusCode: 415, statusMessage: 'File content does not match its declared type' })
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

/**
 * Structural validation for uploaded images: real dimensions parsed from the
 * file's own binary structure (never trusted from the client), a sane cap on
 * both side length and total pixel count, and a reject on anything that
 * doesn't parse as a well-formed header for its declared format.
 *
 * This exists for two concrete threats, not for completeness's sake:
 *
 *  - A "pixel bomb" — a tiny file (a handful of KB) that decodes to an
 *    enormous canvas (JPEG/PNG headers support up to 65535×65535). Any code
 *    path that decodes the image (pdf-lib's embedPng/embedJpg in the Asset
 *    Export renderer, a browser rendering an <img>) pays for the decoded
 *    pixel grid, not the file size — this is a real, cheap DoS vector.
 *  - A truncated or corrupted upload: the magic-byte check in media.ts only
 *    confirms the first few bytes match the format; a header that claims a
 *    structure the rest of the file doesn't actually have should fail here,
 *    not three steps later inside pdf-lib during a render.
 */

export const MAX_IMAGE_DIMENSION = 8000 // px, per side — generous for real listing photography
export const MAX_IMAGE_PIXELS = 40_000_000 // ~40 MP

export interface ImageDimensions {
  width: number
  height: number
}

function readU16BE(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1]
}
function readU16LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}
function readU24LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
}
function readU32LE(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}

function parsePng(b: Uint8Array): ImageDimensions | null {
  // 8-byte signature, then the IHDR chunk: 4-byte length, "IHDR", width, height (both 4-byte BE).
  if (b.length < 24) return null
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null // "IHDR"
  const width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
  const height = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function parseGif(b: Uint8Array): ImageDimensions | null {
  // 6-byte signature ("GIF87a"/"GIF89a"), then width/height as 2-byte LE fields.
  if (b.length < 10) return null
  const width = readU16LE(b, 6)
  const height = readU16LE(b, 8)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

/** Scans JPEG segments for the first Start-Of-Frame marker, which carries the real pixel dimensions. */
function parseJpeg(b: Uint8Array): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let pos = 2
  const limit = Math.min(b.length, 1_000_000) // JPEG headers live near the start; cap the scan
  const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

  while (pos + 4 <= limit) {
    if (b[pos] !== 0xff) {
      pos++ // resync past stray fill bytes
      continue
    }
    const marker = b[pos + 1]
    if (marker === 0xff) {
      pos++ // padding byte between markers
      continue
    }
    if (marker === 0xd8) {
      pos += 2
      continue
    }
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2 // markers with no payload
      continue
    }
    if (marker === 0xda) return null // Start-Of-Scan reached before any SOF — malformed or unsupported
    const segLen = readU16BE(b, pos + 2)
    if (segLen < 2 || pos + 2 + segLen > b.length) return null
    if (SOF_MARKERS.has(marker)) {
      if (pos + 9 > b.length) return null
      const height = readU16BE(b, pos + 5)
      const width = readU16BE(b, pos + 7)
      if (width <= 0 || height <= 0) return null
      return { width, height }
    }
    pos += 2 + segLen
  }
  return null
}

function parseWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30) return null
  const fourCC = String.fromCharCode(b[12], b[13], b[14], b[15])

  if (fourCC === 'VP8X') {
    // Extended format: canvas dimensions are explicit 24-bit (value - 1) fields.
    const width = readU24LE(b, 24) + 1
    const height = readU24LE(b, 27) + 1
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }
  if (fourCC === 'VP8 ') {
    // Simple lossy: a 3-byte frame tag, then the 0x9d 0x01 0x2a start code, then 14-bit W/H.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    const width = readU16LE(b, 26) & 0x3fff
    const height = readU16LE(b, 28) & 0x3fff
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }
  if (fourCC === 'VP8L') {
    // Lossless: signature byte 0x2f, then 14-bit (width-1) + 14-bit (height-1) packed LE.
    if (b[20] !== 0x2f) return null
    const packed = readU32LE(b, 21)
    const width = (packed & 0x3fff) + 1
    const height = ((packed >> 14) & 0x3fff) + 1
    if (width <= 0 || height <= 0) return null
    return { width, height }
  }
  return null
}

/** Parses real pixel dimensions from the file's own bytes. Returns null if the format is unsupported or the header doesn't parse. */
export function parseImageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  try {
    switch (mimeType) {
      case 'image/png':
        return parsePng(bytes)
      case 'image/gif':
        return parseGif(bytes)
      case 'image/jpeg':
        return parseJpeg(bytes)
      case 'image/webp':
        return parseWebp(bytes)
      default:
        return null
    }
  } catch {
    return null // any indexing surprise on a malformed buffer is a rejection, not a crash
  }
}

export interface ImageValidationResult {
  ok: boolean
  reason?: string
  dimensions?: ImageDimensions
}

/**
 * Full structural check: dimensions must parse, and must stay under both the
 * per-side and total-pixel caps. A file whose declared format we validate
 * (png/gif/jpeg/webp) but whose header we can't parse is treated as corrupt —
 * a real encoder never produces an unparseable header for its own format.
 */
export function validateImageIntegrity(bytes: Uint8Array, mimeType: string): ImageValidationResult {
  const dims = parseImageDimensions(bytes, mimeType)
  if (!dims) return { ok: false, reason: 'No se pudo leer la imagen: el archivo está dañado o truncado.' }
  if (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, reason: `Imagen demasiado grande (máximo ${MAX_IMAGE_DIMENSION}px por lado).`, dimensions: dims }
  }
  if (dims.width * dims.height > MAX_IMAGE_PIXELS) {
    return { ok: false, reason: 'Imagen demasiado grande (excede el máximo de píxeles permitido).', dimensions: dims }
  }
  return { ok: true, dimensions: dims }
}

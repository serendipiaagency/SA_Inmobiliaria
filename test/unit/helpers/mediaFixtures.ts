import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'

// --- PNG -------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length, false)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, typeBytes.length)
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(crcInput), false)
  return Buffer.concat([len, typeBytes, data, crc])
}

/**
 * Builds a genuinely valid, genuinely decodable 8-bit RGB PNG at the given
 * pixel dimensions. Used both for "this must be accepted" tests and, with a
 * declared size far beyond MAX_IMAGE_DIMENSION, for the pixel-bomb rejection
 * test — a real encoder never produces a file whose IHDR lies about its own
 * IDAT, but the rejection has to work from the header alone (a truly hostile
 * file wouldn't bother being internally consistent), so `declaredWidth`/
 * `declaredHeight` let a test build exactly that mismatch on purpose.
 */
export function buildPng(width: number, height: number, declaredWidth = width, declaredHeight = height): Uint8Array {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = new Uint8Array(13)
  const ihdrView = new DataView(ihdrData.buffer)
  ihdrView.setUint32(0, declaredWidth, false)
  ihdrView.setUint32(4, declaredHeight, false)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type: truecolor RGB
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = pngChunk('IHDR', ihdrData)

  const raw = new Uint8Array(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // filter type: None
    for (let x = 0; x < width * 3; x++) raw[offset++] = (x + y) % 256
  }
  const idat = pngChunk('IDAT', deflateSync(raw))
  const iend = pngChunk('IEND', new Uint8Array(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

// --- GIF ---------------------------------------------------------------

/** Minimal well-formed-enough GIF for header parsing — real decoders would want more, this only needs to satisfy the app's own dimension parser. */
export function buildGif(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(13)
  buf.set(new TextEncoder().encode('GIF89a'), 0)
  new DataView(buf.buffer).setUint16(6, width, true)
  new DataView(buf.buffer).setUint16(8, height, true)
  buf[10] = 0 // no global color table
  buf[11] = 0
  buf[12] = 0
  return buf
}

// --- JPEG --------------------------------------------------------------

/** SOI + a single SOF0 segment carrying real dimensions + EOI. Not a decodable photo (no scan data), but a structurally valid JPEG header for our own parser. */
export function buildJpeg(width: number, height: number): Uint8Array {
  const sof = new Uint8Array(19)
  sof[0] = 0xff
  sof[1] = 0xd8 // SOI
  sof[2] = 0xff
  sof[3] = 0xc0 // SOF0
  sof[4] = 0x00
  sof[5] = 0x0b // length = 11
  sof[6] = 0x08 // precision
  new DataView(sof.buffer).setUint16(7, height, false)
  new DataView(sof.buffer).setUint16(9, width, false)
  sof[11] = 0x01 // 1 component
  sof[12] = 0x01 // component id
  sof[13] = 0x11 // sampling factors
  sof[14] = 0x00 // quant table id
  sof[15] = 0xff
  sof[16] = 0xd9 // EOI
  return sof.slice(0, 17)
}

// --- WebP (VP8X, extended format) ---------------------------------------

export function buildWebp(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30)
  buf.set(new TextEncoder().encode('RIFF'), 0)
  new DataView(buf.buffer).setUint32(4, 22, true) // file size (not validated by our parser)
  buf.set(new TextEncoder().encode('WEBP'), 8)
  buf.set(new TextEncoder().encode('VP8X'), 12)
  new DataView(buf.buffer).setUint32(16, 10, true) // chunk size
  buf[20] = 0 // flags
  const w = width - 1
  const h = height - 1
  buf[24] = w & 0xff
  buf[25] = (w >> 8) & 0xff
  buf[26] = (w >> 16) & 0xff
  buf[27] = h & 0xff
  buf[28] = (h >> 8) & 0xff
  buf[29] = (h >> 16) & 0xff
  return buf
}

// --- PDF -----------------------------------------------------------------

/** A real, pdf-lib-authored, genuinely valid single-page PDF. */
export async function buildValidPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])
  page.drawText('test fixture')
  return doc.save()
}

/** A well-formed PDF, then truncated mid-structure — pdf-lib should refuse to parse this. */
export async function buildCorruptPdf(): Promise<Uint8Array> {
  const valid = await buildValidPdf()
  return valid.slice(0, Math.floor(valid.length * 0.6))
}

export function buildFakePdfHtml(): Uint8Array {
  return new TextEncoder().encode('<html><body><script>alert(1)</script></body></html>')
}

export function buildMaliciousSvg(): Uint8Array {
  return new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>')
}

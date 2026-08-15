import { describe, expect, it } from 'vitest'
import { contentMatchesType } from '../../server/utils/media'
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, parseImageDimensions, validateImageIntegrity } from '../../server/utils/imageValidation'
import { validatePdfIntegrity } from '../../server/utils/pdfValidation'
import { sha256Hex } from '../../server/utils/checksum'
import { buildCorruptPdf, buildFakePdfHtml, buildGif, buildJpeg, buildMaliciousSvg, buildPng, buildValidPdf, buildWebp } from './helpers/mediaFixtures'

describe('contentMatchesType (magic bytes)', () => {
  it('accepts a real PNG declared as image/png', () => {
    expect(contentMatchesType(buildPng(4, 4), 'image/png')).toBe(true)
  })

  it('accepts a real JPEG declared as image/jpeg', () => {
    expect(contentMatchesType(buildJpeg(4, 4), 'image/jpeg')).toBe(true)
  })

  it('accepts a real GIF declared as image/gif', () => {
    expect(contentMatchesType(buildGif(4, 4), 'image/gif')).toBe(true)
  })

  it('accepts a real WebP declared as image/webp', () => {
    expect(contentMatchesType(buildWebp(4, 4), 'image/webp')).toBe(true)
  })

  it('accepts a real PDF declared as application/pdf', async () => {
    expect(contentMatchesType(await buildValidPdf(), 'application/pdf')).toBe(true)
  })

  it('rejects an HTML payload declared as application/pdf', () => {
    // The core stored-XSS vector this check exists to close: a client can
    // label any bytes with any Content-Type it likes.
    expect(contentMatchesType(buildFakePdfHtml(), 'application/pdf')).toBe(false)
  })

  it('rejects an HTML/script payload declared as any image type', () => {
    const html = buildFakePdfHtml()
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(contentMatchesType(html, type)).toBe(false)
    }
  })

  it('rejects a PNG mislabeled as a PDF and vice versa', () => {
    expect(contentMatchesType(buildPng(2, 2), 'application/pdf')).toBe(false)
  })

  it('has no case for image/svg+xml — SVG is not an accepted type at all', () => {
    // media.ts's ALLOWED_TYPES map has no image/svg+xml entry, so storeFile
    // rejects it before contentMatchesType is even reached (415, unsupported
    // type) — this just documents that the magic-byte switch doesn't secretly
    // special-case SVG back in.
    expect(contentMatchesType(buildMaliciousSvg(), 'image/svg+xml')).toBe(false)
  })
})

describe('parseImageDimensions', () => {
  it('reads real PNG dimensions', () => {
    expect(parseImageDimensions(buildPng(37, 21), 'image/png')).toEqual({ width: 37, height: 21 })
  })

  it('reads real JPEG dimensions from the SOF0 segment', () => {
    expect(parseImageDimensions(buildJpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 })
  })

  it('reads real GIF dimensions', () => {
    expect(parseImageDimensions(buildGif(150, 90), 'image/gif')).toEqual({ width: 150, height: 90 })
  })

  it('reads real WebP (VP8X) dimensions', () => {
    expect(parseImageDimensions(buildWebp(800, 600), 'image/webp')).toEqual({ width: 800, height: 600 })
  })

  it('returns null for a truncated PNG (cut off before IHDR completes)', () => {
    const png = buildPng(10, 10).slice(0, 15) // shorter than the 24-byte minimum
    expect(parseImageDimensions(png, 'image/png')).toBeNull()
  })

  it('returns null for a JPEG with no SOF marker (only SOI)', () => {
    const truncated = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]) // SOI + EOI, nothing else
    expect(parseImageDimensions(truncated, 'image/jpeg')).toBeNull()
  })

  it('returns null for an unsupported mime type', () => {
    expect(parseImageDimensions(buildPng(4, 4), 'image/bmp')).toBeNull()
  })
})

describe('validateImageIntegrity', () => {
  it('accepts a normal-sized real image of every supported format', () => {
    expect(validateImageIntegrity(buildPng(200, 150), 'image/png').ok).toBe(true)
    expect(validateImageIntegrity(buildJpeg(200, 150), 'image/jpeg').ok).toBe(true)
    expect(validateImageIntegrity(buildGif(200, 150), 'image/gif').ok).toBe(true)
    expect(validateImageIntegrity(buildWebp(200, 150), 'image/webp').ok).toBe(true)
  })

  it('rejects a corrupted/truncated image', () => {
    const result = validateImageIntegrity(buildPng(10, 10).slice(0, 15), 'image/png')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/dañado|truncado/)
  })

  it('rejects an image whose header exceeds MAX_IMAGE_DIMENSION per side', () => {
    // A pixel bomb: a tiny file that CLAIMS an enormous canvas. Real decoders
    // (pdf-lib's embedPng, a browser <img>) pay for the decoded grid, not the
    // file size — this is the concrete DoS this check exists to stop.
    const bomb = buildPng(4, 4, MAX_IMAGE_DIMENSION + 1, 4)
    const result = validateImageIntegrity(bomb, 'image/png')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/grande/)
  })

  it('rejects an image whose total pixel count exceeds MAX_IMAGE_PIXELS even under the per-side cap', () => {
    const side = Math.floor(Math.sqrt(MAX_IMAGE_PIXELS)) + 100
    expect(side).toBeLessThan(MAX_IMAGE_DIMENSION) // stays under the per-side cap on purpose
    const bomb = buildPng(4, 4, side, side)
    const result = validateImageIntegrity(bomb, 'image/png')
    expect(result.ok).toBe(false)
  })

  it('accepts an image right at the dimension boundary', () => {
    const atLimit = buildPng(4, 4, MAX_IMAGE_DIMENSION, 1)
    expect(validateImageIntegrity(atLimit, 'image/png').ok).toBe(true)
  })
})

describe('validatePdfIntegrity', () => {
  it('accepts a genuinely valid PDF', async () => {
    const result = await validatePdfIntegrity(await buildValidPdf())
    expect(result.ok).toBe(true)
    expect(result.pageCount).toBe(1)
  })

  it('rejects a truncated/corrupted PDF', async () => {
    const result = await validatePdfIntegrity(await buildCorruptPdf())
    expect(result.ok).toBe(false)
  })

  it('rejects an HTML payload even though it is not run through magic-byte checking here', async () => {
    // Defense in depth: even if something upstream let a non-PDF through,
    // pdf-lib itself refuses to parse it.
    const result = await validatePdfIntegrity(buildFakePdfHtml())
    expect(result.ok).toBe(false)
  })
})

describe('sha256Hex', () => {
  it('is deterministic for identical bytes', async () => {
    const bytes = buildPng(10, 10)
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes))
  })

  it('differs for different bytes', async () => {
    expect(await sha256Hex(buildPng(10, 10))).not.toBe(await sha256Hex(buildPng(11, 11)))
  })

  it('matches a known SHA-256 vector for an empty buffer', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

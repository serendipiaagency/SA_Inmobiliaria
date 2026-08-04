import jsQR from 'jsqr'
import { renderQrMatrix } from '../qr'

const MODULE_PX = 6
const QUIET_ZONE_MODULES = 4

/**
 * Rasterizes the exact same module matrix drawn into the PDF (see
 * pdfRenderer.drawQrElement — identical `matrix.data[row*size+col]` truthy
 * check) into a plain RGBA pixel buffer. No canvas/DOM/image-file involved —
 * jsQR decodes raw pixel buffers, not image files, so this is the minimal
 * real input it needs.
 */
function rasterizeQrMatrix(matrix: { size: number; data: Uint8Array }): { pixels: Uint8ClampedArray; width: number; height: number } {
  const dim = matrix.size + QUIET_ZONE_MODULES * 2
  const width = dim * MODULE_PX
  const height = width
  const pixels = new Uint8ClampedArray(width * height * 4)
  pixels.fill(255) // white background — covers the quiet zone and every light module at once

  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.data[row * matrix.size + col]) continue
      const px0 = (col + QUIET_ZONE_MODULES) * MODULE_PX
      const py0 = (row + QUIET_ZONE_MODULES) * MODULE_PX
      for (let dy = 0; dy < MODULE_PX; dy++) {
        for (let dx = 0; dx < MODULE_PX; dx++) {
          const idx = ((py0 + dy) * width + (px0 + dx)) * 4
          pixels[idx] = 0
          pixels[idx + 1] = 0
          pixels[idx + 2] = 0
          pixels[idx + 3] = 255
        }
      }
    }
  }
  return { pixels, width, height }
}

export interface QrRoundTripResult {
  /** Whether this render even had a QR element bound to real text — a piece with no QR isn't a validation failure. */
  present: boolean
  ok: boolean
  decoded: string | null
  error?: string
}

/**
 * Encodes `text` the same way the PDF renderer does, rasterizes the
 * resulting matrix, and decodes it back with jsQR — a genuine round-trip
 * check, not a simulated pass. This app draws the QR as raw black/white
 * vector modules (no logo overlay, no photo compositing, no styling that
 * could visually corrupt it), so a failure here means a real encoder bug,
 * not a cosmetic contrast/legibility issue — there's nothing to "increase
 * the margin or reduce the logo" on, because none of that exists in this
 * renderer.
 */
export function validateQrRoundTrip(text: string): QrRoundTripResult {
  if (!text) return { present: false, ok: true, decoded: null }
  try {
    const matrix = renderQrMatrix(text, 'M')
    const { pixels, width, height } = rasterizeQrMatrix(matrix)
    const result = jsQR(pixels, width, height)
    if (!result) return { present: true, ok: false, decoded: null, error: 'No se pudo decodificar el QR generado' }
    return {
      present: true,
      ok: result.data === text,
      decoded: result.data,
      error: result.data === text ? undefined : 'El contenido decodificado no coincide con el texto codificado',
    }
  } catch (err: any) {
    return { present: true, ok: false, decoded: null, error: err?.message || 'Error al validar el QR' }
  }
}

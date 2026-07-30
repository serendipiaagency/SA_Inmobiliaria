// @types/qrcode only covers the package root (`qrcode`), not the internal
// subpaths server/utils/qr.ts imports directly to avoid pulling in the
// Node-only pngjs/canvas renderers (see the comment in qr.ts for why).
declare module 'qrcode/lib/core/qrcode.js' {
  export interface QrBitMatrix {
    size: number
    data: Uint8Array
  }
  export interface QrCodeData {
    modules: QrBitMatrix
    version: number
    errorCorrectionLevel: unknown
    maskPattern: number
    segments: unknown[]
  }
  export function create(text: string, options?: { errorCorrectionLevel?: string; version?: number; maskPattern?: number }): QrCodeData
}

declare module 'qrcode/lib/renderer/svg-tag.js' {
  import type { QrCodeData } from 'qrcode/lib/core/qrcode.js'
  export function render(qrData: QrCodeData, options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } }): string
}

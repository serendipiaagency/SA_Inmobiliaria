// Imports the qrcode package's core encoder and SVG renderer directly by subpath
// instead of the package root. The root entry (`qrcode` / `qrcode/lib/index.js`)
// eagerly requires the Node PNG renderer, which requires `pngjs`, which calls
// `util.inherits(ChunkStream, Stream)` against this Worker's `node:stream` compat
// shim and crashes at module-load time with "superCtor.prototype must be of type
// object" — confirmed by reproducing it in wrangler dev. The core encoder and the
// SVG-tag renderer are pure JS with no Node-only dependency, so importing only
// those two subpaths avoids pngjs (and canvas) entirely.
import * as QRCodeCore from 'qrcode/lib/core/qrcode.js'
import * as SvgTagRenderer from 'qrcode/lib/renderer/svg-tag.js'

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrMatrix {
  size: number
  data: Uint8Array
}

export interface QrRenderOptions {
  errorCorrectionLevel?: QrErrorCorrectionLevel
  width?: number
  margin?: number
  colorDark?: string
  colorLight?: string
}

function encode(text: string, errorCorrectionLevel: QrErrorCorrectionLevel = 'M') {
  return QRCodeCore.create(text, { errorCorrectionLevel })
}

/** Raw module bitmap — used to draw the QR as vector rectangles (e.g. in a PDF via pdf-lib). */
export function renderQrMatrix(text: string, errorCorrectionLevel: QrErrorCorrectionLevel = 'M'): QrMatrix {
  const { modules } = encode(text, errorCorrectionLevel)
  return { size: modules.size, data: modules.data }
}

/** SVG markup — used for on-screen preview and embedding in HTML-based pieces. */
export function renderQrSvg(text: string, opts: QrRenderOptions = {}): string {
  const qrData = encode(text, opts.errorCorrectionLevel)
  return SvgTagRenderer.render(qrData, {
    width: opts.width || 512,
    margin: opts.margin ?? 4,
    color: { dark: opts.colorDark || '#000000ff', light: opts.colorLight || '#ffffffff' },
  })
}

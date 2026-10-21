import type { PDFDocument, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { isKnownFont } from '../../../utils/siteBuilder/fonts'

/**
 * Fuentes de marca en los carteles PDF (Cola 22·5b). pdf-lib sólo trae las
 * fuentes estándar (Helvetica); para incrustar una familia del Brand Kit hay
 * que darle los bytes de la fuente. Aquí se descargan de Google Fonts en
 * tiempo de render y se cachean por isolate.
 *
 * Se pide el formato TTF (no WOFF2): fontkit parsea TrueType de forma nativa,
 * sin brotli ni wasm, que es lo que el Worker de Cloudflare no admite por la
 * restricción de codegen dinámico (lo mismo que descartó satori/resvg). Para
 * que Google sirva TTF se usa la API v1 de CSS con un User-Agent antiguo.
 *
 * Todo degrada con seguridad: ante cualquier fallo (red, formato, parseo) se
 * devuelve null y el renderizador usa Helvetica, como antes. Nunca rompe un
 * cartel por no poder cargar una fuente.
 */
const bytesCache = new Map<string, Uint8Array | null>()
const registered = new WeakSet<PDFDocument>()

async function fetchTtfBytes(family: string, weight: number): Promise<Uint8Array | null> {
  const key = `${family}|${weight}`
  if (bytesCache.has(key)) return bytesCache.get(key) ?? null
  let bytes: Uint8Array | null = null
  try {
    const cssUrl = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${weight}`
    // UA antiguo → Google devuelve url(...ttf) en lugar de woff2.
    const cssRes = await fetch(cssUrl, { headers: { 'user-agent': 'Mozilla/4.0 (compatible; MSIE 8.0)' } })
    if (cssRes.ok) {
      const css = await cssRes.text()
      const m = css.match(/url\((https:\/\/[^)]+\.ttf)\)/i)
      if (m) {
        const ttfRes = await fetch(m[1])
        if (ttfRes.ok) bytes = new Uint8Array(await ttfRes.arrayBuffer())
      }
    }
  } catch {
    bytes = null
  }
  bytesCache.set(key, bytes)
  return bytes
}

/**
 * Incrusta una familia del Brand Kit en el documento y devuelve la fuente, o
 * null si no es una familia conocida o no se pudo cargar/incrustar (→ Helvetica).
 */
export async function embedBrandFont(doc: PDFDocument, family: string | null | undefined, weight: number): Promise<PDFFont | null> {
  if (!isKnownFont(family)) return null
  const bytes = await fetchTtfBytes(family, weight)
  if (!bytes) return null
  try {
    if (!registered.has(doc)) {
      doc.registerFontkit(fontkit)
      registered.add(doc)
    }
    return await doc.embedFont(bytes, { subset: true })
  } catch {
    return null
  }
}

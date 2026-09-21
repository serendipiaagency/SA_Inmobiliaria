import type { H3Event } from 'h3'
import type { TemplateStructure } from './types'
import type { AssetBindings } from './bindings'
import { fetchImageBytes } from './bindings'
import { FORMAT_BY_KEY, type FormatDef } from './formats'
import { looksLikePng, renderStructureHtml } from './htmlRenderer'
import { cfEnv } from '../db'

/**
 * Rasteriza un formato de redes (1080×1080, 1080×1350, 1080×1920) a PNG con
 * Browser Rendering de Cloudflare: un Chromium sin cabeza al que se le pasa
 * el HTML de htmlRenderer.ts y se le pide una captura.
 *
 * ## Qué hace falta y qué pasa sin ello
 *
 * El binding `BROWSER` en wrangler.toml:
 *
 *     [browser]
 *     binding = "BROWSER"
 *
 * y el paquete @cloudflare/puppeteer (ya en package.json). Sin el binding,
 * `isSocialRenderingAvailable()` es falso y el endpoint de render responde el
 * mismo 422 honesto de siempre, diciendo qué falta. Browser Rendering no se
 * puede ejecutar en `wrangler dev` local ni en las pruebas: este fichero
 * está escrito contra la API documentada de @cloudflare/puppeteer y sólo se
 * puede verificar desplegado con el binding activo — por eso el binding va
 * comentado en wrangler.toml hasta que alguien con acceso a la cuenta lo
 * active y compruebe una pieza.
 *
 * Lo que sí se prueba sin navegador es todo lo demás: el HTML que se le da
 * (test/unit/htmlRenderer.test.ts) y la decisión de disponibilidad.
 */

export function isSocialRenderingAvailable(env: Record<string, any> | undefined): boolean {
  return Boolean(env?.BROWSER)
}

/** Si este formato se puede producir HOY en este Worker: los PDF siempre; los de redes, sólo con el binding. */
export function isFormatRenderable(format: FormatDef | undefined, env: Record<string, any> | undefined): boolean {
  if (!format) return false
  if (format.family === 'social') return isSocialRenderingAvailable(env)
  return format.renderReady
}

export function formatUnavailableMessage(format: FormatDef): string {
  if (format.family === 'social') {
    return `El formato "${format.label}" necesita Browser Rendering: activa el binding [browser] BROWSER en wrangler.toml (docs/asset-export-studio.md).`
  }
  return `El formato "${format.label}" todavía no tiene renderizador.`
}

function toDataUri(bytes: Uint8Array, format: 'png' | 'jpg'): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:image/${format === 'png' ? 'png' : 'jpeg'};base64,${btoa(binary)}`
}

/**
 * PNG de la primera página de la estructura, al tamaño exacto del formato.
 * Las imágenes se resuelven aquí (R2 o URL) y se incrustan como data URI: el
 * navegador de Browser Rendering no tiene la sesión del panel y no podría
 * pedirlas a /api/media.
 */
export async function renderSocialPng(event: H3Event, structure: TemplateStructure, formatKey: string, bindings: AssetBindings): Promise<Uint8Array> {
  const env = cfEnv(event) as Record<string, any>
  const format = FORMAT_BY_KEY[formatKey]
  if (!format) throw createError({ statusCode: 400, statusMessage: `Unknown formatKey: ${formatKey}` })
  if (!isSocialRenderingAvailable(env)) throw createError({ statusCode: 422, statusMessage: formatUnavailableMessage(format) })

  const images = new Map<string, string>()
  for (const key of Object.values(bindings.images)) {
    if (!key || images.has(key)) continue
    const image = await fetchImageBytes(event, key)
    if (image) images.set(key, toDataUri(image.bytes, image.format))
  }
  const html = renderStructureHtml({ structure, formatKey, bindings, images })

  // Import dinámico: el paquete sólo tiene sentido dentro del Worker con el
  // binding; así el resto del código (y las pruebas) no lo cargan nunca.
  const puppeteer = (await import('@cloudflare/puppeteer')).default
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: format.widthPt, height: format.heightPt, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: format.widthPt, height: format.heightPt } })
    const bytes = shot instanceof Uint8Array ? shot : new Uint8Array(shot as ArrayBuffer)
    if (!looksLikePng(bytes)) throw createError({ statusCode: 500, statusMessage: 'Browser Rendering no devolvió un PNG' })
    return bytes
  } finally {
    await browser.close()
  }
}

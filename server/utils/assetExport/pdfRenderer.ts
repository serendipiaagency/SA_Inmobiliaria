import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from 'pdf-lib'
import type { H3Event } from 'h3'
import type { TemplateStructure, TemplateElement } from './types'
import type { AssetBindings } from './bindings'
import { fetchImageBytes } from './bindings'
import { renderQrMatrix } from '../qr'
import { FORMAT_BY_KEY } from './formats'

const BINDING_RE = /^\{\{([a-zA-Z0-9_.]+)\}\}$/

function resolveBindingText(binding: string | undefined, bindings: AssetBindings): string {
  if (!binding) return ''
  const match = BINDING_RE.exec(binding.trim())
  if (!match) return binding // static text — not a {{token}}
  return bindings.values[match[1]] ?? ''
}

export function hexToRgb(hex: string | undefined, fallback: RGB): RGB {
  if (!hex) return fallback
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function resolveColor(style: Record<string, unknown> | undefined, bindings: AssetBindings): RGB {
  const color = style?.color as string | undefined
  if (color === 'primary') return hexToRgb(bindings.values['tenant.primaryColor'], rgb(0.08, 0.08, 0.06))
  if (color === 'secondary') return hexToRgb(bindings.values['tenant.secondaryColor'], rgb(0.4, 0.35, 0.2))
  if (color === 'muted') return rgb(0.45, 0.44, 0.42)
  if (typeof color === 'string') return hexToRgb(color, rgb(0.08, 0.08, 0.06))
  return rgb(0.08, 0.08, 0.06)
}

export function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

async function drawTextElement(page: import('pdf-lib').PDFPage, el: TemplateElement, text: string, fonts: { regular: PDFFont; bold: PDFFont }, bindings: AssetBindings, pageHeight: number) {
  const style = el.style || {}
  const fontSize = Number(style.fontSize) || 12
  const font = style.weight && Number(style.weight) >= 600 ? fonts.bold : fonts.regular
  const color = resolveColor(style, bindings)
  const lineHeight = fontSize * (Number(style.lineHeight) || 1.3)
  const displayText = style.uppercase ? text.toUpperCase() : text

  const lines = wrapText(displayText, font, fontSize, el.w)
  const maxLines = Math.max(1, Math.floor(el.h / lineHeight))
  const top = pageHeight - el.y
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    page.drawText(lines[i], { x: el.x, y: top - fontSize - i * lineHeight, size: fontSize, font, color })
  }
}

function drawQrElement(page: import('pdf-lib').PDFPage, el: TemplateElement, text: string, pageHeight: number) {
  if (!text) return
  const matrix = renderQrMatrix(text, 'M')
  const cell = el.w / matrix.size
  const boxTop = pageHeight - el.y // pdf-y of the box's top edge (CSS-style y is measured from the page top)
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.data[row * matrix.size + col]) {
        page.drawRectangle({ x: el.x + col * cell, y: boxTop - (row + 1) * cell, width: cell, height: cell, color: rgb(0, 0, 0) })
      }
    }
  }
}

/**
 * Renders one template structure into a real, downloadable PDF using
 * pdf-lib (no native deps, confirmed working under Cloudflare Workers — see
 * commit history for why satori/resvg were ruled out for the image formats
 * instead). Element coordinates are top-left/CSS-style (x, y, w, h); pdf-lib's
 * origin is bottom-left, so every draw call converts via `pageHeight - y`.
 */
export async function renderPdf(event: H3Event, structure: TemplateStructure, formatKey: string, bindings: AssetBindings): Promise<Uint8Array> {
  const format = FORMAT_BY_KEY[formatKey]
  if (!format) throw createError({ statusCode: 400, statusMessage: `Unknown formatKey: ${formatKey}` })

  const pdfDoc = await PDFDocument.create()
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  }

  const imageCache = new Map<string, { bytes: Uint8Array; format: 'png' | 'jpg' } | null>()
  const embedCache = new Map<string, import('pdf-lib').PDFImage | null>()

  for (const templatePage of structure.pages) {
    const page = pdfDoc.addPage([format.widthPt, format.heightPt])
    const sortedElements = [...templatePage.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

    for (const el of sortedElements) {
      if (el.type === 'text') {
        await drawTextElement(page, el, resolveBindingText(el.binding, bindings), fonts, bindings, format.heightPt)
      } else if (el.type === 'qr') {
        drawQrElement(page, el, resolveBindingText(el.binding, bindings), format.heightPt)
      } else if (el.type === 'image') {
        const match = el.binding ? BINDING_RE.exec(el.binding.trim()) : null
        const key = match ? bindings.images[match[1]] : null
        if (!key) continue

        if (!imageCache.has(key)) imageCache.set(key, await fetchImageBytes(event, key))
        const image = imageCache.get(key)
        if (!image) continue

        if (!embedCache.has(key)) {
          try {
            embedCache.set(key, image.format === 'png' ? await pdfDoc.embedPng(image.bytes) : await pdfDoc.embedJpg(image.bytes))
          } catch {
            embedCache.set(key, null) // unsupported/corrupt image — skip this element rather than fail the whole render
          }
        }
        const embedded = embedCache.get(key)
        if (embedded) page.drawImage(embedded, { x: el.x, y: format.heightPt - el.y - el.h, width: el.w, height: el.h })
      }
    }
  }

  return pdfDoc.save()
}

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { H3Event } from 'h3'
import type { TenantBindings } from './bindings'
import { fetchImageBytes } from './bindings'
import { hexToRgb, wrapText } from './pdfRenderer'
import { FORMAT_BY_KEY } from './formats'

export interface CatalogFragment {
  title: string
  pageCount: number
}

export interface CatalogIndexEntry {
  title: string
  startPage: number
}

/**
 * Pure layout math, split out from the pdf-lib drawing code so it can be
 * unit-tested without a Workers runtime: cover is always page 1, the index
 * spans as many pages as its entries need, and each fragment's real start
 * page follows once its own preceding fragments' page counts are summed.
 */
export function computeCatalogLayout(fragments: CatalogFragment[], linesPerIndexPage: number): { indexPageCount: number; entries: CatalogIndexEntry[] } {
  const safeLines = Math.max(1, linesPerIndexPage)
  const indexPageCount = fragments.length === 0 ? 1 : Math.max(1, Math.ceil(fragments.length / safeLines))
  let cursor = 1 + indexPageCount
  const entries = fragments.map((f) => {
    const startPage = cursor + 1
    cursor += Math.max(1, f.pageCount)
    return { title: f.title, startPage }
  })
  return { indexPageCount, entries }
}

function drawCoverPage(page: import('pdf-lib').PDFPage, widthPt: number, heightPt: number, fonts: { regular: PDFFont; bold: PDFFont }, tenant: TenantBindings, coverTitle: string, assetCount: number, logo: import('pdf-lib').PDFImage | null) {
  const primary = hexToRgb(tenant.primaryColor, rgb(0.08, 0.08, 0.06))
  const secondary = hexToRgb(tenant.secondaryColor, rgb(0.4, 0.35, 0.2))

  page.drawRectangle({ x: 0, y: heightPt - 8, width: widthPt, height: 8, color: secondary })

  if (logo) {
    const maxW = widthPt * 0.35
    const scale = Math.min(1, maxW / logo.width)
    page.drawImage(logo, { x: 48, y: heightPt - 48 - logo.height * scale, width: logo.width * scale, height: logo.height * scale })
  }

  const titleFontSize = 30
  const titleLines = wrapText(coverTitle, fonts.bold, titleFontSize, widthPt - 96)
  let y = heightPt * 0.42
  for (const line of titleLines) {
    page.drawText(line, { x: 48, y, size: titleFontSize, font: fonts.bold, color: primary })
    y -= titleFontSize * 1.25
  }

  page.drawText(`${assetCount} ${assetCount === 1 ? 'activo' : 'activos'} incluidos`, { x: 48, y: y - 16, size: 13, font: fonts.regular, color: rgb(0.45, 0.44, 0.42) })

  const footerParts = [tenant.orgName, tenant.phone, tenant.email].filter(Boolean)
  if (footerParts.length) page.drawText(footerParts.join('  ·  '), { x: 48, y: 40, size: 10, font: fonts.regular, color: rgb(0.45, 0.44, 0.42) })
}

function drawIndexPages(pdfDoc: PDFDocument, widthPt: number, heightPt: number, fonts: { regular: PDFFont; bold: PDFFont }, tenant: TenantBindings, entries: CatalogIndexEntry[], linesPerPage: number) {
  const primary = hexToRgb(tenant.primaryColor, rgb(0.08, 0.08, 0.06))
  const chunks: CatalogIndexEntry[][] = []
  for (let i = 0; i < Math.max(entries.length, 1); i += linesPerPage) chunks.push(entries.slice(i, i + linesPerPage))
  if (chunks.length === 0) chunks.push([])

  for (const chunk of chunks) {
    const page = pdfDoc.addPage([widthPt, heightPt])
    page.drawText('Índice', { x: 48, y: heightPt - 72, size: 20, font: fonts.bold, color: primary })
    let y = heightPt - 120
    for (const entry of chunk) {
      const lines = wrapText(entry.title, fonts.regular, 12, widthPt - 160)
      page.drawText(lines[0] || entry.title, { x: 48, y, size: 12, font: fonts.regular, color: rgb(0.08, 0.08, 0.06) })
      page.drawText(String(entry.startPage), { x: widthPt - 80, y, size: 12, font: fonts.regular, color: rgb(0.45, 0.44, 0.42) })
      y -= 22
    }
  }
}

/**
 * Assembles one combined catalog PDF from already-rendered per-asset PDF
 * fragments (each produced by renderPdf(), the same function single-asset
 * dossiers use). copyPages is a structural copy, not a re-render, so merging
 * dozens of already-rendered pages stays cheap even under Workers' CPU limit.
 */
export async function assembleCatalogPdf(
  event: H3Event,
  params: {
    formatKey: string
    coverTitle: string
    tenant: TenantBindings
    fragments: Array<{ title: string; pageCount: number; bytes: Uint8Array }>
  },
): Promise<Uint8Array> {
  const format = FORMAT_BY_KEY[params.formatKey]
  if (!format) throw createError({ statusCode: 400, statusMessage: `Unknown formatKey: ${params.formatKey}` })

  const pdfDoc = await PDFDocument.create()
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  }

  const logoImage = await fetchImageBytes(event, params.tenant.logo)
  let embeddedLogo: import('pdf-lib').PDFImage | null = null
  if (logoImage) {
    try {
      embeddedLogo = logoImage.format === 'png' ? await pdfDoc.embedPng(logoImage.bytes) : await pdfDoc.embedJpg(logoImage.bytes)
    } catch {
      embeddedLogo = null
    }
  }

  const cover = pdfDoc.addPage([format.widthPt, format.heightPt])
  drawCoverPage(cover, format.widthPt, format.heightPt, fonts, params.tenant, params.coverTitle, params.fragments.length, embeddedLogo)

  const linesPerIndexPage = Math.max(1, Math.floor((format.heightPt - 160) / 22))
  const { entries } = computeCatalogLayout(params.fragments, linesPerIndexPage)
  drawIndexPages(pdfDoc, format.widthPt, format.heightPt, fonts, params.tenant, entries, linesPerIndexPage)

  for (const fragment of params.fragments) {
    const src = await PDFDocument.load(fragment.bytes)
    const copiedPages = await pdfDoc.copyPages(src, src.getPageIndices())
    for (const p of copiedPages) pdfDoc.addPage(p)
  }

  return pdfDoc.save()
}

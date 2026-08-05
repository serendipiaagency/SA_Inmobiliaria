import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { wrapText } from '../assetExport/pdfRenderer'

const PAGE_W = 595.28 // A4 @ 72dpi
const PAGE_H = 841.89
const MARGIN = 56
const BODY_SIZE = 11
const BODY_LINE_HEIGHT = BODY_SIZE * 1.45
const CONTENT_WIDTH = PAGE_W - MARGIN * 2

/**
 * Flowing-text contract PDF: paragraphs wrap and flow across pages, unlike Asset
 * Export Studio's renderer which places elements at fixed x/y coordinates. Contracts
 * are prose (clauses), not layout templates, so a text-flow model fits the content.
 */
export async function renderContractPdf(opts: {
  title: string
  bodyText: string
  clientName: string
  acceptance?: { byName: string; ip: string; userAgent: string; at: string } | null
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.08, 0.08, 0.06)
  const muted = rgb(0.45, 0.44, 0.42)

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let cursorY = PAGE_H - MARGIN

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H])
    cursorY = PAGE_H - MARGIN
  }

  function ensureSpace(neededHeight: number) {
    if (cursorY - neededHeight < MARGIN) newPage()
  }

  // Title
  ensureSpace(28)
  page.drawText(opts.title, { x: MARGIN, y: cursorY - 20, size: 18, font: bold, color: ink })
  cursorY -= 36

  const paragraphs = opts.bodyText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  for (const paragraph of paragraphs) {
    const lines = wrapText(paragraph, regular, BODY_SIZE, CONTENT_WIDTH)
    for (const line of lines) {
      ensureSpace(BODY_LINE_HEIGHT)
      page.drawText(line, { x: MARGIN, y: cursorY - BODY_SIZE, size: BODY_SIZE, font: regular, color: ink })
      cursorY -= BODY_LINE_HEIGHT
    }
    cursorY -= BODY_LINE_HEIGHT * 0.5 // paragraph gap
  }

  if (opts.acceptance) {
    ensureSpace(90)
    cursorY -= 12
    page.drawLine({ start: { x: MARGIN, y: cursorY }, end: { x: PAGE_W - MARGIN, y: cursorY }, thickness: 0.5, color: muted })
    cursorY -= 20
    page.drawText('Aceptado electrónicamente', { x: MARGIN, y: cursorY - 12, size: 12, font: bold, color: ink })
    cursorY -= 26
    const lines = [
      `Nombre: ${opts.acceptance.byName}`,
      `Fecha: ${opts.acceptance.at}`,
      `Dirección IP: ${opts.acceptance.ip}`,
      `Navegador: ${opts.acceptance.userAgent.slice(0, 90)}`,
    ]
    for (const line of lines) {
      ensureSpace(16)
      page.drawText(line, { x: MARGIN, y: cursorY - 9, size: 9.5, font: regular, color: muted })
      cursorY -= 16
    }
  }

  return pdfDoc.save()
}

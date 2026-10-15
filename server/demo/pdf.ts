import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { wrapText } from '../utils/assetExport/pdfRenderer'
import { DEMO_DISCLAIMER } from './dataset/referencia'

/**
 * Los documentos de demostración de las propiedades de referencia (fichas
 * comerciales, memorias de calidades, resúmenes…): un PDF sencillo de texto,
 * con el rótulo «DOCUMENTO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL» en una franja
 * en TODAS las páginas y otra vez al pie. Sin firmas, sellos ni logotipos
 * oficiales: no imita ningún documento auténtico. Sólo usa los caracteres de la
 * fuente estándar (WinAnsi), que cubre el castellano.
 */

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56
const BAND_H = 26
const BODY = 10.5
const LINE = BODY * 1.5
const WIDTH = PAGE_W - MARGIN * 2

export async function renderDemoDocumentPdf(opts: { title: string; subtitle?: string; sections: { heading: string; lines: string[] }[]; footer: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${opts.title} (documento de demostración)`)
  pdf.setSubject(DEMO_DISCLAIMER)
  pdf.setProducer('Norte Astur Inmobiliaria — cuenta demo')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.11, 0.11, 0.1)
  const muted = rgb(0.4, 0.39, 0.37)
  const band = rgb(0.98, 0.95, 0.88)
  const bandInk = rgb(0.42, 0.32, 0.09)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN - BAND_H

  function frame() {
    page.drawRectangle({ x: 0, y: PAGE_H - BAND_H - 8, width: PAGE_W, height: BAND_H + 8, color: band })
    page.drawText(DEMO_DISCLAIMER, { x: MARGIN, y: PAGE_H - BAND_H + 6, size: 10, font: bold, color: bandInk })
  }
  frame()
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H])
    frame()
    y = PAGE_H - MARGIN - BAND_H
  }
  const ensure = (h: number) => {
    if (y - h < MARGIN + 24) newPage()
  }

  ensure(30)
  for (const line of wrapText(opts.title, bold, 18, WIDTH)) {
    ensure(24)
    page.drawText(line, { x: MARGIN, y: y - 18, size: 18, font: bold, color: ink })
    y -= 24
  }
  if (opts.subtitle) {
    for (const line of wrapText(opts.subtitle, regular, 10, WIDTH)) {
      page.drawText(line, { x: MARGIN, y: y - 10, size: 10, font: regular, color: muted })
      y -= 15
    }
  }
  y -= 10

  for (const section of opts.sections) {
    ensure(LINE * 3)
    page.drawText(section.heading, { x: MARGIN, y: y - 12, size: 12, font: bold, color: ink })
    y -= 20
    for (const text of section.lines) {
      const lines = wrapText(`• ${text}`, regular, BODY, WIDTH)
      for (const line of lines) {
        ensure(LINE)
        page.drawText(line, { x: MARGIN, y: y - BODY, size: BODY, font: regular, color: ink })
        y -= LINE
      }
    }
    y -= 8
  }

  // Pie de cada página: el rótulo otra vez, quién lo genera y el número de página.
  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 14 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 14 }, thickness: 0.5, color: muted })
    p.drawText(`${DEMO_DISCLAIMER} · ${opts.footer}`, { x: MARGIN, y: MARGIN, size: 7.5, font: regular, color: muted })
    p.drawText(`${i + 1} / ${pages.length}`, { x: PAGE_W - MARGIN - 24, y: MARGIN, size: 7.5, font: regular, color: muted })
  })
  return pdf.save()
}

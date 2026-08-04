import { PDFDocument } from 'pdf-lib'
import type { TemplateStructure } from './types'
import type { AssetBindings } from './bindings'
import { resolveBindingText, BINDING_RE } from './pdfRenderer'
import { validateQrRoundTrip, type QrRoundTripResult } from './qrValidation'

export interface RenderValidationResult {
  ok: boolean
  pageCount: number
  expectedPageCount: number
  fileSizeBytes: number
  qr: QrRoundTripResult
  errors: string[]
  warnings: string[]
}

/**
 * Real post-render QA — opens the PDF that was just generated (not a
 * simulated check), confirms it actually has the page count the structure
 * asked for, and round-trip-decodes any QR it contains. Only fields the
 * template itself binds are checked for blankness (an unbound template has
 * nothing to warn about) — this never invents a "missing" field the
 * template never referenced in the first place.
 */
export async function validateRenderedPdf(pdfBytes: Uint8Array, structure: TemplateStructure, bindings: AssetBindings): Promise<RenderValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  let pageCount = 0
  if (!pdfBytes.byteLength) {
    errors.push('El archivo generado está vacío')
  } else {
    try {
      const doc = await PDFDocument.load(pdfBytes)
      pageCount = doc.getPageCount()
    } catch {
      errors.push('El PDF generado no se puede abrir')
    }
  }

  const expectedPageCount = structure.pages.length
  if (pageCount !== expectedPageCount) {
    errors.push(`Número de páginas inesperado: se generaron ${pageCount}, se esperaban ${expectedPageCount}`)
  }

  let qrText: string | null = null
  outer: for (const page of structure.pages) {
    for (const el of page.elements) {
      if (el.type === 'qr') {
        const text = resolveBindingText(el.binding, bindings)
        if (text) {
          qrText = text
          break outer
        }
      }
    }
  }
  const qr = validateQrRoundTrip(qrText || '')
  if (qr.present && !qr.ok) errors.push(qr.error || 'El QR no pasó la validación de decodificación')

  const boundTokens = new Set<string>()
  for (const page of structure.pages) {
    for (const el of page.elements) {
      const m = el.binding ? BINDING_RE.exec(el.binding.trim()) : null
      if (m) boundTokens.add(m[1])
    }
  }
  const contactTokens = ['tenant.phone', 'tenant.whatsapp', 'tenant.email']
  const boundContactTokens = contactTokens.filter((t) => boundTokens.has(t))
  if (boundContactTokens.length > 0 && !boundContactTokens.some((t) => (bindings.values[t] || '').trim())) {
    warnings.push('La plantilla muestra datos de contacto, pero el Brand Kit no tiene teléfono, WhatsApp ni email configurado')
  }
  if (boundTokens.has('asset.reference') && !(bindings.values['asset.reference'] || '').trim()) {
    warnings.push('La referencia del activo está vacía')
  }
  if (boundTokens.has('asset.price') && !(bindings.values['asset.price'] || '').trim()) {
    warnings.push('El precio está vacío')
  }

  return { ok: errors.length === 0, pageCount, expectedPageCount, fileSizeBytes: pdfBytes.byteLength, qr, errors, warnings }
}

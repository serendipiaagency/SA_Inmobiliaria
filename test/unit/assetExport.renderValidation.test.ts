import { describe, expect, it } from 'vitest'
import { renderPdf } from '../../server/utils/assetExport/pdfRenderer'
import { validateRenderedPdf } from '../../server/utils/assetExport/renderValidation'
import type { TemplateStructure } from '../../server/utils/assetExport/types'
import type { AssetBindings } from '../../server/utils/assetExport/bindings'

// renderPdf only touches its `event` argument for image bindings — none of
// these structures bind an image, so a stub event is safe here.
const fakeEvent = {} as any

function bindings(overrides: Partial<AssetBindings['values']> = {}): AssetBindings {
  return {
    values: {
      'asset.title': 'Ático de lujo', 'asset.reference': '42', 'asset.price': '450.000 €', 'asset.qrCode': 'https://example.com/q/abc123',
      'tenant.phone': '', 'tenant.whatsapp': '', 'tenant.email': '', ...overrides,
    },
    images: {},
  }
}

describe('validateRenderedPdf', () => {
  it('passes a real, well-formed single-page render with a valid QR', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [{ id: 'qr1', type: 'qr', x: 40, y: 40, w: 100, h: 100, binding: '{{asset.qrCode}}' }] }] }
    const b = bindings()
    const pdf = await renderPdf(fakeEvent, structure, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.pageCount).toBe(1)
    expect(result.qr.present).toBe(true)
    expect(result.qr.ok).toBe(true)
    expect(result.qr.decoded).toBe('https://example.com/q/abc123')
  })

  it('matches page count across a real multi-page dossier', async () => {
    const structure: TemplateStructure = {
      pages: [
        { id: 'p1', elements: [{ id: 't1', type: 'text', x: 0, y: 0, w: 200, h: 20, binding: '{{asset.title}}' }] },
        { id: 'p2', elements: [{ id: 't2', type: 'text', x: 0, y: 0, w: 200, h: 20, binding: '{{asset.price}}' }] },
        { id: 'p3', elements: [] },
      ],
    }
    const b = bindings()
    const pdf = await renderPdf(fakeEvent, structure, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.ok).toBe(true)
    expect(result.pageCount).toBe(3)
    expect(result.expectedPageCount).toBe(3)
  })

  it('has no QR opinion at all when the template never binds one', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [{ id: 't1', type: 'text', x: 0, y: 0, w: 200, h: 20, binding: '{{asset.title}}' }] }] }
    const b = bindings()
    const pdf = await renderPdf(fakeEvent, structure, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.ok).toBe(true)
    expect(result.qr.present).toBe(false)
  })

  it('flags a real corrupt/truncated PDF as failing, not passing silently', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [] }] }
    const b = bindings()
    const corrupted = new Uint8Array([1, 2, 3, 4, 5]) // not a real PDF at all
    const result = await validateRenderedPdf(corrupted, structure, b)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('no se puede abrir'))).toBe(true)
  })

  it('flags an empty file as failing', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [] }] }
    const result = await validateRenderedPdf(new Uint8Array(0), structure, bindings())
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('vacío'))).toBe(true)
  })

  it('warns (without failing) when the template binds contact info the Brand Kit never filled in', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [{ id: 't1', type: 'text', x: 0, y: 0, w: 200, h: 20, binding: '{{tenant.phone}}' }] }] }
    const b = bindings({ 'tenant.phone': '', 'tenant.whatsapp': '', 'tenant.email': '' })
    const pdf = await renderPdf(fakeEvent, structure, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.ok).toBe(true) // missing contact info is a warning, not a hard failure
    expect(result.warnings.some((w) => w.includes('contacto'))).toBe(true)
  })

  it('does not warn about contact info when the template never references it', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [{ id: 't1', type: 'text', x: 0, y: 0, w: 200, h: 20, binding: '{{asset.title}}' }] }] }
    const b = bindings({ 'tenant.phone': '', 'tenant.whatsapp': '', 'tenant.email': '' })
    const pdf = await renderPdf(fakeEvent, structure, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.warnings).toEqual([])
  })

  it('reports a page-count mismatch as a hard error', async () => {
    const structure: TemplateStructure = { pages: [{ id: 'p1', elements: [] }, { id: 'p2', elements: [] }] }
    const b = bindings()
    // Render only one page's worth on purpose, then validate against the two-page structure.
    const onePage: TemplateStructure = { pages: [structure.pages[0]] }
    const pdf = await renderPdf(fakeEvent, onePage, 'pdf_a4_portrait', b)
    const result = await validateRenderedPdf(pdf, structure, b)
    expect(result.ok).toBe(false)
    expect(result.pageCount).toBe(1)
    expect(result.expectedPageCount).toBe(2)
    expect(result.errors.some((e) => e.includes('páginas'))).toBe(true)
  })
})

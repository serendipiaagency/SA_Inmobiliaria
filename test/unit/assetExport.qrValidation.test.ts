import { describe, expect, it } from 'vitest'
import { validateQrRoundTrip } from '../../server/utils/assetExport/qrValidation'

describe('validateQrRoundTrip', () => {
  it('reports no QR present for empty text without treating it as a failure', () => {
    const result = validateQrRoundTrip('')
    expect(result.present).toBe(false)
    expect(result.ok).toBe(true)
    expect(result.decoded).toBeNull()
  })

  it('genuinely decodes a short URL back to the exact original text', () => {
    const url = 'https://example.com/q/abc123'
    const result = validateQrRoundTrip(url)
    expect(result.present).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.decoded).toBe(url)
  })

  it('round-trips a longer, realistic public URL', () => {
    const url = 'https://sa-inmobiliaria.example.com/demo/property-details/atico-de-lujo-en-marbella-con-vistas-al-mar'
    const result = validateQrRoundTrip(url)
    expect(result.ok).toBe(true)
    expect(result.decoded).toBe(url)
  })

  it('is deterministic — encoding the same text twice always decodes the same way', () => {
    const url = 'https://example.com/q/xyz'
    const a = validateQrRoundTrip(url)
    const b = validateQrRoundTrip(url)
    expect(a).toEqual(b)
  })
})

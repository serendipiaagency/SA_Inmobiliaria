import { describe, expect, it } from 'vitest'
import { FORMATS, FORMAT_BY_KEY, isValidFormatKey } from '../../server/utils/assetExport/formats'

describe('formats registry', () => {
  it('has no duplicate keys (the registry is the single source of truth everywhere else keys it)', () => {
    const keys = FORMATS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every format has positive dimensions', () => {
    for (const f of FORMATS) {
      expect(f.widthPt).toBeGreaterThan(0)
      expect(f.heightPt).toBeGreaterThan(0)
    }
  })

  it('isValidFormatKey matches FORMAT_BY_KEY exactly', () => {
    for (const f of FORMATS) expect(isValidFormatKey(f.key)).toBe(true)
    expect(isValidFormatKey('not_a_real_format')).toBe(false)
  })

  it('every pdf/print format is marked renderReady (pdf-lib covers them); social formats are honestly marked not ready', () => {
    for (const f of FORMATS) {
      if (f.family === 'social') expect(f.renderReady).toBe(false)
      else expect(f.renderReady).toBe(true)
    }
  })

  it('FORMAT_BY_KEY resolves every registered key to itself', () => {
    for (const f of FORMATS) expect(FORMAT_BY_KEY[f.key]).toEqual(f)
  })
})

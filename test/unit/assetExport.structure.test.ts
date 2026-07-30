import { describe, expect, it } from 'vitest'
import { validateStructure } from '../../server/utils/assetExport/types'

describe('validateStructure', () => {
  it('accepts a well-formed structure', () => {
    const result = validateStructure({ pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 20 }] }] })
    expect(result.ok).toBe(true)
  })

  it('rejects a non-object', () => {
    expect(validateStructure(null).ok).toBe(false)
    expect(validateStructure('not an object').ok).toBe(false)
  })

  it('rejects a structure with no pages array', () => {
    expect(validateStructure({}).ok).toBe(false)
    expect(validateStructure({ pages: 'nope' }).ok).toBe(false)
  })

  it('rejects a page with no string id', () => {
    const result = validateStructure({ pages: [{ elements: [] }] })
    expect(result.ok).toBe(false)
  })

  it('rejects a page with a non-array elements field', () => {
    const result = validateStructure({ pages: [{ id: 'p1', elements: 'nope' }] })
    expect(result.ok).toBe(false)
  })

  it('rejects an element with an invalid type', () => {
    const result = validateStructure({ pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'circle', x: 0, y: 0, w: 10, h: 10 }] }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('circle')
  })

  it('rejects an element with a non-numeric dimension', () => {
    const result = validateStructure({ pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'text', x: '0', y: 0, w: 10, h: 10 }] }] })
    expect(result.ok).toBe(false)
  })

  it('rejects an element with a NaN/Infinity dimension', () => {
    expect(validateStructure({ pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'text', x: NaN, y: 0, w: 10, h: 10 }] }] }).ok).toBe(false)
    expect(validateStructure({ pages: [{ id: 'p1', elements: [{ id: 'e1', type: 'text', x: Infinity, y: 0, w: 10, h: 10 }] }] }).ok).toBe(false)
  })

  it('caps the number of pages', () => {
    const pages = Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, elements: [] }))
    const result = validateStructure({ pages })
    expect(result.ok).toBe(false)
  })

  it('caps the number of elements per page', () => {
    const elements = Array.from({ length: 101 }, (_, i) => ({ id: `e${i}`, type: 'text', x: 0, y: 0, w: 10, h: 10 }))
    const result = validateStructure({ pages: [{ id: 'p1', elements }] })
    expect(result.ok).toBe(false)
  })
})

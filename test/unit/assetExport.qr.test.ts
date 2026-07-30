import { describe, expect, it } from 'vitest'
import { renderQrMatrix, renderQrSvg } from '../../server/utils/qr'

describe('renderQrMatrix', () => {
  it('produces a square matrix matching size*size data length', () => {
    const { size, data } = renderQrMatrix('https://example.com/p/demo-123')
    expect(size).toBeGreaterThan(0)
    expect(data.length).toBe(size * size)
  })

  it('is deterministic for the same input', () => {
    const a = renderQrMatrix('https://example.com/p/demo-123')
    const b = renderQrMatrix('https://example.com/p/demo-123')
    expect(a.size).toBe(b.size)
    expect([...a.data]).toEqual([...b.data])
  })

  it('produces different matrices for different content', () => {
    const a = renderQrMatrix('https://example.com/a')
    const b = renderQrMatrix('https://example.com/completely-different-and-much-longer-url-b')
    expect(a.size === b.size && [...a.data].join('') === [...b.data].join('')).toBe(false)
  })

  it('a longer URL needs a version with at least as many modules', () => {
    const short = renderQrMatrix('https://x.co/a')
    const long = renderQrMatrix('https://example.com/property-details/a-very-long-and-descriptive-property-slug-goes-right-here')
    expect(long.size).toBeGreaterThanOrEqual(short.size)
  })
})

describe('renderQrSvg', () => {
  it('produces a well-formed SVG document', () => {
    const svg = renderQrSvg('https://example.com/q/abc123')
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })

  it('respects custom colors', () => {
    const svg = renderQrSvg('https://example.com/q/abc123', { colorDark: '#123456ff', colorLight: '#ffffffff' })
    expect(svg).toContain('123456')
  })
})

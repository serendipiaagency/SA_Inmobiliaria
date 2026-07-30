import { describe, expect, it } from 'vitest'
import { computeCatalogLayout } from '../../server/utils/assetExport/catalogRenderer'

describe('catalog layout', () => {
  it('places the first fragment right after the cover + a single index page when everything fits', () => {
    const { indexPageCount, entries } = computeCatalogLayout(
      [
        { title: 'Villa A', pageCount: 3 },
        { title: 'Villa B', pageCount: 2 },
      ],
      20,
    )
    expect(indexPageCount).toBe(1)
    // page 1 = cover, page 2 = index, so Villa A starts on page 3
    expect(entries[0]).toEqual({ title: 'Villa A', startPage: 3 })
    // Villa A occupies pages 3-5, so Villa B starts on page 6
    expect(entries[1]).toEqual({ title: 'Villa B', startPage: 6 })
  })

  it('spans the index across multiple pages once entries exceed one page worth of lines', () => {
    const fragments = Array.from({ length: 25 }, (_, i) => ({ title: `Activo ${i}`, pageCount: 1 }))
    const { indexPageCount, entries } = computeCatalogLayout(fragments, 20)
    expect(indexPageCount).toBe(2)
    // cover (1) + index (2 pages) = 3 pages before content
    expect(entries[0].startPage).toBe(4)
  })

  it('treats a zero/negative pageCount as at least one page so the layout never overlaps', () => {
    const { entries } = computeCatalogLayout(
      [
        { title: 'A', pageCount: 0 },
        { title: 'B', pageCount: 1 },
      ],
      20,
    )
    expect(entries[1].startPage).toBe(entries[0].startPage + 1)
  })

  it('reserves exactly one index page for an empty fragment list', () => {
    const { indexPageCount, entries } = computeCatalogLayout([], 20)
    expect(indexPageCount).toBe(1)
    expect(entries).toEqual([])
  })
})

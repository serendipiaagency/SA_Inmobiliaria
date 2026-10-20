import { describe, expect, it } from 'vitest'
import { publicCatalogComparator, type PublicMergeRow } from '../../server/utils/properties/publicSearch'

/**
 * El comparador que mezcla los dos catálogos (obra nueva + 2ª mano) ya
 * ordenados por SQL. Tiene que reproducir `publicSearchOrder`: lo que no tiene
 * el dato (sin precio, sin bajada, sin €/m²) al final, el id como desempate
 * (desc, salvo «Antiguos»), y las de referencia de la demo primero sólo en
 * «Relevancia».
 */

const row = (over: Partial<PublicMergeRow> & { id: number }): PublicMergeRow => ({ demoRank: 0, ...over })
const order = (rows: PublicMergeRow[], sort: any, demo = false) => [...rows].sort(publicCatalogComparator(sort, demo)).map((r) => r.id)

describe('publicCatalogComparator', () => {
  it('precio ascendente/descendente: sin precio al final, id como desempate', () => {
    const rows = [row({ id: 1, price: 200 }), row({ id: 2, price: null }), row({ id: 3, price: 100 }), row({ id: 4, price: 0 })]
    expect(order(rows, 'price_asc')).toEqual([3, 1, 2, 4]) // 100, 200, luego sin precio (asc: null antes que 0, igual que SQLite)
    expect(order(rows, 'price_desc')).toEqual([1, 3, 4, 2]) // 200, 100, luego sin precio (desc: 0 antes que null)
  })

  it('recientes/antiguos por fecha; antiguos rompe empate por id ascendente', () => {
    const rows = [row({ id: 1, published: '2026-03-01' }), row({ id: 2, published: '2026-05-01' }), row({ id: 3, published: '2026-03-01' })]
    expect(order(rows, 'newest')).toEqual([2, 3, 1]) // 05 primero; empate 03 → id desc (3,1)
    expect(order(rows, 'oldest')).toEqual([1, 3, 2]) // 03 primero; empate 03 → id asc (1,3)
  })

  it('«Han bajado más» y €/m²: lo que no tiene el dato, al final', () => {
    const drops = [row({ id: 1, drop: 0.1 }), row({ id: 2, drop: null }), row({ id: 3, drop: 0.25 })]
    expect(order(drops, 'price_drop')).toEqual([3, 1, 2]) // 25%, 10%, luego sin bajada
    const ppm2 = [row({ id: 1, ppm2: 2000 }), row({ id: 2, ppm2: null }), row({ id: 3, ppm2: 1500 })]
    expect(order(ppm2, 'ppm2_asc')).toEqual([3, 1, 2])
    expect(order(ppm2, 'ppm2_desc')).toEqual([1, 3, 2])
  })

  it('relevancia: exclusivas primero, luego más recientes, luego id', () => {
    const rows = [row({ id: 1, exclusive: 0, published: '2026-05-01' }), row({ id: 2, exclusive: 1, published: '2026-01-01' }), row({ id: 3, exclusive: 1, published: '2026-04-01' })]
    expect(order(rows, '')).toEqual([3, 2, 1]) // exclusivas (3,2 por fecha), luego la no exclusiva
  })

  it('en «Relevancia» con demo activa, las de referencia primero por su puesto', () => {
    const rows = [row({ id: 1, demoRank: 2, published: '2026-06-01' }), row({ id: 2, demoRank: 0, published: '2026-01-01' }), row({ id: 3, demoRank: 1, published: '2026-02-01' })]
    expect(order(rows, '', true)).toEqual([2, 3, 1]) // rank 0, 1, luego el resto
    // Sin demo activa, el rank se ignora: manda la fecha.
    expect(order(rows, '', false)).toEqual([1, 3, 2])
  })

  it('mezclar dos listas ya ordenadas == ordenar la unión (cualquier orden total)', () => {
    const a = [row({ id: 10, price: 100 }), row({ id: 11, price: 300 })]
    const b = [row({ id: 20, price: 50 }), row({ id: 21, price: 300 })]
    const merged = order([...a, ...b], 'price_asc')
    const union = order([...a, ...b], 'price_asc')
    expect(merged).toEqual(union)
    expect(merged).toEqual([20, 10, 21, 11]) // 50, 100, 300(id21), 300(id11 — id desc)
  })
})

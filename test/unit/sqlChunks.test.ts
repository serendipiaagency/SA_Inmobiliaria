import { describe, expect, it } from 'vitest'
import { chunkList, D1_IN_CHUNK, selectInChunks } from '../../server/utils/sqlChunks'

/**
 * D1 rechaza consultas con más de 100 parámetros: un `IN (…)` con una página
 * entera de ids más la organización fallaba en producción (el SQLite de los
 * tests no tiene ese límite, por eso se prueba el troceo en sí).
 */
describe('IN por trozos para D1', () => {
  it('parte la lista sin perder ni repetir elementos y con trozos por debajo del límite', () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1)
    const parts = chunkList(ids)
    expect(parts.every((p) => p.length <= D1_IN_CHUNK)).toBe(true)
    expect(D1_IN_CHUNK + 5).toBeLessThan(100)
    expect(parts.flat()).toEqual(ids)
  })

  it('junta los resultados en orden y no consulta nada con la lista vacía', async () => {
    const calls: number[][] = []
    const out = await selectInChunks(Array.from({ length: 170 }, (_, i) => i), async (part) => {
      calls.push(part)
      return part.map((n) => n * 2)
    })
    expect(calls).toHaveLength(3)
    expect(out).toEqual(Array.from({ length: 170 }, (_, i) => i * 2))
    let called = false
    expect(await selectInChunks([], async () => ((called = true), []))).toEqual([])
    expect(called).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryOverpass } from '../../server/utils/pois'

/**
 * El bloque «Estilo de vida» de la ficha se quedaba sin datos (o colgado)
 * porque dependía de un único espejo de Overpass (`overpass-api.de`), que
 * limita/corta a las IP de Cloudflare. `queryOverpass` ahora prueba varios
 * espejos en orden, con un tope de tiempo real por conexión, y sólo devuelve
 * puntos de interés reales (nunca inventados). Estas pruebas fijan ese
 * comportamiento con `fetch` simulado.
 */

const OK_BODY = {
  elements: [
    { id: 1, lat: 36.5, lon: -4.88, tags: { name: 'Colegio Las Chapas', amenity: 'school' } },
    { id: 2, lat: 36.51, lon: -4.89, tags: { name: 'Mercadona', shop: 'supermarket' } },
    { id: 3, lat: 36.52, lon: -4.9, tags: { name: 'Sin categoría conocida', leisure: 'park' } },
    { id: 4, lat: 36.5, lon: -4.88, tags: { amenity: 'school' } }, // sin nombre → se descarta
  ],
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('queryOverpass (espejos con tope de tiempo)', () => {
  it('devuelve los POIs del primer espejo que responde correctamente', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(OK_BODY))
    vi.stubGlobal('fetch', fetchMock)

    const pois = await queryOverpass('[out:json];();out;')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Sólo los elementos con coordenadas y nombre; el park es categoría «otro».
    expect(pois).toEqual([
      { id: 1, name: 'Colegio Las Chapas', lat: 36.5, lng: -4.88, type: 'colegios' },
      { id: 2, name: 'Mercadona', lat: 36.51, lng: -4.89, type: 'super' },
      { id: 3, name: 'Sin categoría conocida', lat: 36.52, lng: -4.9, type: 'otro' },
    ])
    // Envía una User-Agent descriptiva (los espejos rechazan clientes anónimos).
    const headers = (fetchMock.mock.calls[0][1] as any).headers
    expect(headers['user-agent']).toMatch(/PortalInmo/i)
  })

  it('pasa al siguiente espejo cuando el primero limita (no-ok) y acumula el fallo de red', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network reset')) // espejo 1: error de red
      .mockResolvedValueOnce(jsonResponse({}, false, 429)) // espejo 2: rate-limit
      .mockResolvedValueOnce(jsonResponse(OK_BODY)) // espejo 3: ok
    vi.stubGlobal('fetch', fetchMock)

    const pois = await queryOverpass('[out:json];();out;')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(pois.map((p) => p.name)).toContain('Mercadona')
  })

  it('devuelve [] (nunca inventa) cuando todos los espejos fallan', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'))
    vi.stubGlobal('fetch', fetchMock)

    const pois = await queryOverpass('[out:json];();out;')

    expect(pois).toEqual([])
    // Probó todos los espejos antes de rendirse.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('aborta un espejo que se cuelga (tope de tiempo real) y pasa al siguiente', async () => {
    // Espejo 1: una conexión que nunca responde sola; sólo termina si se aborta
    // su señal. Espejo 2: responde bien. Sin el tope de tiempo, el primero
    // dejaría la petición colgada para siempre (el síntoma del «esqueleto»).
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, opts: any) => {
        return new Promise((_resolve, reject) => {
          const signal: AbortSignal = opts.signal
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      })
      .mockResolvedValueOnce(jsonResponse(OK_BODY))
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers()
    try {
      const promise = queryOverpass('[out:json];();out;')
      // Más allá del tope por conexión (6 s): el primer espejo aborta y se prueba el segundo.
      await vi.advanceTimersByTimeAsync(7000)
      const pois = await promise
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(pois.map((p) => p.name)).toContain('Colegio Las Chapas')
    } finally {
      vi.useRealTimers()
    }
  })
})

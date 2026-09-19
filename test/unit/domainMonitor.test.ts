import { describe, expect, it } from 'vitest'
import { checkDomain, domainAlertKind, isDomainCheckMinute, summarizeDomainHealth } from '../../server/utils/domainMonitor'

/**
 * La comprobación sintética de dominios existe por un incidente concreto:
 * un dominio de cliente que respondía pero no llegaba a su agencia, sin que
 * nadie lo viera. Cada caso de abajo es una forma real en que un dominio
 * puede estar "mal" y la comprobación tiene que distinguirla de "bien".
 */

type Route = { status: number; body?: any; contentType?: string }

/** Un fetch de mentira que responde según la ruta pedida; guarda qué se pidió. */
function fakeFetch(routes: Record<string, Route | Error>, calls: string[] = []): typeof fetch {
  return (async (input: any) => {
    const url = String(input)
    calls.push(url)
    const path = new URL(url).pathname
    const route = routes[path]
    if (!route) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    if (route instanceof Error) throw route
    const contentType = route.contentType ?? 'application/json'
    const body = contentType.includes('json') ? JSON.stringify(route.body ?? {}) : String(route.body ?? '')
    return new Response(body, { status: route.status, headers: { 'content-type': contentType } })
  }) as typeof fetch
}

const HEALTHY = {
  '/api/auth/me': { status: 200, body: { user: null } },
  '/api/public/tenant': { status: 200, body: { id: 2, name: 'Skyline', isCustomDomain: true } },
}

describe('checkDomain', () => {
  it('un dominio sano responde en /api/auth/me y resuelve a su organización', async () => {
    const calls: string[] = []
    const result = await checkDomain('skyline.example', 2, fakeFetch(HEALTHY, calls))
    expect(result.ok).toBe(true)
    expect(result.httpStatus).toBe(200)
    expect(result.error).toBeNull()
    // Siempre por https y sin credenciales: lo que ve cualquiera desde fuera.
    expect(calls).toEqual(['https://skyline.example/api/auth/me', 'https://skyline.example/api/public/tenant'])
  })

  it('el caso del incidente: el dominio responde pero sirve OTRA agencia', async () => {
    const result = await checkDomain('skyline.example', 2, fakeFetch({ ...HEALTHY, '/api/public/tenant': { status: 200, body: { id: 1, isCustomDomain: true } } }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('sirve la organización #1 en vez de la #2')
  })

  it('el dominio responde pero el enrutado lo trata como host primario', async () => {
    const result = await checkDomain('skyline.example', 1, fakeFetch({ ...HEALTHY, '/api/public/tenant': { status: 200, body: { id: 1, isCustomDomain: false } } }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('host primario')
  })

  it('un dominio que el tenant no reconoce recibe el 404 del enrutado', async () => {
    const result = await checkDomain('olvidado.example', 2, fakeFetch({ '/api/auth/me': { status: 404, body: { statusMessage: 'This domain is not configured' } } }))
    expect(result.ok).toBe(false)
    expect(result.httpStatus).toBe(404)
    expect(result.error).toContain('no está configurado para ninguna agencia')
  })

  it('un dominio que apunta a otro sitio (HTML en vez de JSON) no cuenta como bueno aunque dé 200', async () => {
    const result = await checkDomain('parking.example', 2, fakeFetch({ '/api/auth/me': { status: 200, body: '<html>parked</html>', contentType: 'text/html' } }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no está sirviendo esta plataforma')
  })

  it('un dominio que no resuelve o no conecta se marca como no alcanzable', async () => {
    const result = await checkDomain('nadie.example', 2, fakeFetch({ '/api/auth/me': new TypeError('fetch failed') }))
    expect(result.ok).toBe(false)
    expect(result.httpStatus).toBeNull()
    expect(result.error).toContain('no se pudo conectar')
  })

  it('un dominio que se cuelga se corta por tiempo, no se espera para siempre', async () => {
    const hanging = ((_input: any, init: any) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })) as typeof fetch
    const result = await checkDomain('lento.example', 2, hanging, 20)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('sin respuesta')
  })
})

describe('domainAlertKind', () => {
  it('avisa al caer y al recuperarse, no en cada comprobación', () => {
    expect(domainAlertKind(true, false)).toBe('failed')
    expect(domainAlertKind(false, false)).toBeNull()
    expect(domainAlertKind(false, true)).toBe('recovered')
    expect(domainAlertKind(true, true)).toBeNull()
  })

  it('la primera comprobación de un dominio recién asignado avisa si falla, y calla si va bien', () => {
    expect(domainAlertKind(null, false)).toBe('failed')
    expect(domainAlertKind(null, true)).toBeNull()
  })
})

describe('isDomainCheckMinute', () => {
  it('sólo en los minutos múltiplo del intervalo', () => {
    expect(isDomainCheckMinute(new Date('2026-09-19T10:00:00Z'))).toBe(true)
    expect(isDomainCheckMinute(new Date('2026-09-19T10:10:00Z'))).toBe(true)
    expect(isDomainCheckMinute(new Date('2026-09-19T10:07:00Z'))).toBe(false)
  })
})

describe('summarizeDomainHealth', () => {
  it('resume qué falla y cuándo se miró por última vez', () => {
    const summary = summarizeDomainHealth([
      { domain: 'a.example', organizationId: 1, ok: true, error: null, checkedAt: '2026-09-19 10:00:00' },
      { domain: 'b.example', organizationId: 2, ok: false, error: 'x', checkedAt: '2026-09-19 10:10:00' },
    ])
    expect(summary.total).toBe(2)
    expect(summary.failing).toEqual([{ domain: 'b.example', error: 'x' }])
    expect(summary.lastCheckedAt).toBe('2026-09-19 10:10:00')
  })
})

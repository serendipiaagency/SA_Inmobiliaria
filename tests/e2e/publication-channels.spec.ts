import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * Proves the two guarantees server/utils/publication/adapters.ts + the
 * scheduler API exist to give: a channel with no real integration can never
 * be scheduled (create.post.ts rejects it before a single row is written),
 * and the channel list honestly reports which ones are actually usable —
 * over real HTTP, against the real endpoints an admin's browser calls.
 */

test.describe('Publicación multicanal — estado honesto', () => {
  let a: APIRequestContext

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })
  test.afterAll(async () => {
    await a?.dispose()
  })

  test('el listado de canales marca todos como no implementados hoy, sin excepción', async () => {
    const res = await a.get('/api/admin/scheduler/channels')
    expect(res.ok()).toBeTruthy()
    const { rows } = await res.json()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.implemented, `${row.key} no debería estar marcado como implementado`).toBe(false)
    }
    // These are the two portals the original bug report named explicitly.
    expect(rows.some((r: any) => r.key === 'idealista' && r.implemented === false)).toBe(true)
    expect(rows.some((r: any) => r.key === 'fotocasa' && r.implemented === false)).toBe(true)
  })

  test('crear una programación contra un canal no implementado se rechaza (422) y no crea nada', async () => {
    const devRes = await a.post('/api/admin/developers', {
      data: { name: `Publication e2e dev ${Date.now()}`, email: `pub-e2e-${Date.now()}@mm.test`, status: 'active' },
    })
    expect(devRes.ok()).toBeTruthy()
    const propRes = await a.post('/api/admin/developer-properties', {
      data: { developerId: (await devRes.json()).id, name: `Publication e2e property ${Date.now()}`, status: 'new', price: 400000 },
    })
    expect(propRes.ok()).toBeTruthy()
    const developerPropertyId = (await propRes.json()).id

    const before = await a.get('/api/admin/scheduler/schedules')
    const beforeCount = (await before.json()).rows?.length ?? 0

    const create = await a.post('/api/admin/scheduler/create', {
      data: {
        developerPropertyId,
        baseScheduledAt: '2026-06-01 09:00:00',
        steps: [{ channelKey: 'idealista', offsetMinutes: 0 }],
      },
    })
    expect(create.status(), await create.text()).toBe(422)

    const after = await a.get('/api/admin/scheduler/schedules')
    const afterCount = (await after.json()).rows?.length ?? 0
    expect(afterCount, 'no debe haberse creado ninguna programación nueva').toBe(beforeCount)
  })

  test('mezclar un canal implementable con uno no implementado también se rechaza entero', async () => {
    const devRes = await a.post('/api/admin/developers', {
      data: { name: `Publication e2e dev mix ${Date.now()}`, email: `pub-e2e-mix-${Date.now()}@mm.test`, status: 'active' },
    })
    const propRes = await a.post('/api/admin/developer-properties', {
      data: { developerId: (await devRes.json()).id, name: `Publication e2e property mix ${Date.now()}`, status: 'new', price: 400000 },
    })
    const developerPropertyId = (await propRes.json()).id

    const create = await a.post('/api/admin/scheduler/create', {
      data: {
        developerPropertyId,
        baseScheduledAt: '2026-06-01 09:00:00',
        steps: [
          { channelKey: 'own_web', offsetMinutes: 0 },
          { channelKey: 'idealista', offsetMinutes: 10 },
        ],
      },
    })
    expect(create.status(), await create.text()).toBe(422)
  })
})

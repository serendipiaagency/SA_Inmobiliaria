import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

/**
 * The Property Builder (components/property-builder/) replaced the flat
 * generic form for developer-properties/properties with a sectioned editor,
 * but it still goes through the exact same /api/admin/<resource> endpoints
 * as every other resource. These tests exercise the one real backend change
 * that shipped with it — adminResources.ts now exposes ~30 developer_properties
 * columns (bedrooms, amenity flags, lat/lng, premium photos…) that already
 * existed on the table and on the public site, but had no editable field
 * before this — plus the child-resource flows (gallery/floor-plans) the
 * builder's section nav wires up.
 */

test.describe('Property Builder — API', () => {
  let a: APIRequestContext
  let createdId: number | null = null
  let createdFloorPlanId: number | null = null

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    if (createdFloorPlanId) await a.delete(`/api/admin/floor-plans/${createdFloorPlanId}`).catch(() => null)
    if (createdId) await a.delete(`/api/admin/developer-properties/${createdId}`).catch(() => null)
    await a?.dispose()
  })

  test('crea una propiedad y persiste los campos ampliados (habitaciones, amenities booleanas, lat/lng)', async () => {
    const devRes = await a.post('/api/admin/developers', {
      data: { name: `Property Builder e2e dev ${Date.now()}`, email: `pb-e2e-${Date.now()}@mm.test`, status: 'active' },
    })
    expect(devRes.ok()).toBeTruthy()
    const developerId = (await devRes.json()).id

    const createRes = await a.post('/api/admin/developer-properties', {
      data: {
        developerId,
        name: `Property Builder e2e tower ${Date.now()}`,
        status: 'new',
        price: 620000,
        bedrooms: 3,
        bathrooms: 2,
        area: 145.5,
        orientation: 'SE',
        hasPool: true,
        hasElevator: false,
        isExclusive: true,
        lat: 25.0772,
        lng: 55.1409,
        street: 'Sheikh Zayed Road',
        videoUrl: 'https://example.com/tour.mp4',
      },
    })
    expect(createRes.ok(), await createRes.text()).toBeTruthy()
    createdId = (await createRes.json()).id

    const getRes = await a.get(`/api/admin/developer-properties/${createdId}`)
    expect(getRes.ok()).toBeTruthy()
    const row = (await getRes.json()).row
    expect(row.bedrooms).toBe(3)
    expect(row.bathrooms).toBe(2)
    expect(row.area).toBe(145.5)
    expect(row.orientation).toBe('SE')
    // JS booleans from the builder's checkboxes coerce through buildPayload's
    // Number() conversion into the 0/1 these integer columns store.
    expect(row.hasPool).toBe(1)
    expect(row.hasElevator).toBe(0)
    expect(row.isExclusive).toBe(1)
    expect(row.lat).toBe(25.0772)
    expect(row.lng).toBe(55.1409)
    expect(row.street).toBe('Sheikh Zayed Road')
    expect(row.videoUrl).toBe('https://example.com/tour.mp4')
  })

  test('un hijo (floor-plans) creado justo después de crear la propiedad queda correctamente vinculado', async () => {
    expect(createdId).not.toBeNull()
    const fpRes = await a.post('/api/admin/floor-plans', {
      data: { developerPropertyId: createdId, category: 'e2e category', unitType: '2BR' },
    })
    expect(fpRes.ok(), await fpRes.text()).toBeTruthy()
    createdFloorPlanId = (await fpRes.json()).id

    const list = await a.get('/api/admin/floor-plans?perPage=100')
    const rows = (await list.json()).rows
    const mine = rows.filter((r: any) => r.developerPropertyId === createdId)
    expect(mine.length).toBe(1)
    expect(mine[0].category).toBe('e2e category')
  })

  test('actualizar solo un campo ampliado no pisa el resto de la ficha', async () => {
    expect(createdId).not.toBeNull()
    const before = (await (await a.get(`/api/admin/developer-properties/${createdId}`)).json()).row
    const put = await a.put(`/api/admin/developer-properties/${createdId}`, { data: { bedrooms: 4 } })
    expect(put.ok()).toBeTruthy()
    const after = (await (await a.get(`/api/admin/developer-properties/${createdId}`)).json()).row
    expect(after.bedrooms).toBe(4)
    expect(after.name).toBe(before.name)
    expect(after.hasPool).toBe(before.hasPool)
    expect(after.lat).toBe(before.lat)
  })
})

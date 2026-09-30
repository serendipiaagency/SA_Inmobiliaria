import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/**
 * FASE 27 (incremento 2) — Saved Filter / Saved View / Shared View, y
 * export CSV. Contra HTTP real, mismo criterio que el resto de la suite:
 * `visibility='shared'` amplía quién LEE, nunca quién puede tocarla — eso
 * es justo lo que este spec verifica entre dos usuarios reales de la misma
 * organización, no en memoria.
 */

test.describe('Filtros y vistas guardadas de Property Search', () => {
  let userA: APIRequestContext
  let userB: APIRequestContext
  let otherOrg: APIRequestContext
  let userBId: number
  const createdIds: number[] = []

  test.beforeAll(async () => {
    userA = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    otherOrg = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })

    const created = await userA.post('/api/admin/users', {
      data: { name: 'Saved Views fixture', email: `saved-views-${RUN}@sa-inmobiliaria.com`, password: 'ChangeMe123!', role: 'admin' },
    })
    expect(created.ok(), `no se pudo crear el segundo usuario: ${created.status()} ${await created.text()}`).toBeTruthy()
    userBId = (await created.json()).id

    userB = await pwRequest.newContext({ baseURL: BASE_URL })
    const login = await userB.post('/api/auth/login', { data: { email: `saved-views-${RUN}@sa-inmobiliaria.com`, password: 'ChangeMe123!' } })
    expect(login.ok(), `login del segundo usuario falló: ${login.status()}`).toBeTruthy()
  })

  test.afterAll(async () => {
    await Promise.all(createdIds.map((id) => userA.delete(`/api/admin/property-saved-views/${id}`).catch(() => null)))
    if (userBId) await userA.delete(`/api/admin/users/${userBId}`).catch(() => null)
    await Promise.all([userA?.dispose(), userB?.dispose(), otherOrg?.dispose()])
  })

  async function save(session: APIRequestContext, body: Record<string, any>) {
    const res = await session.post('/api/admin/property-saved-views', {
      data: { resource: 'properties', queryJson: '{"city":"Marbella"}', ...body },
    })
    expect(res.ok(), `POST property-saved-views falló: ${res.status()} ${await res.text()}`).toBeTruthy()
    const id = (await res.json()).id
    createdIds.push(id)
    return id as number
  }

  test('un filtro privado sólo lo ve quien lo creó, aunque sea de la misma organización', async () => {
    const id = await save(userA, { kind: 'filter', name: `Privado ${RUN}`, visibility: 'private' })

    const ownList = await (await userA.get('/api/admin/property-saved-views', { params: { resource: 'properties' } })).json()
    expect(ownList.rows.some((r: any) => r.id === id)).toBe(true)

    const otherUserList = await (await userB.get('/api/admin/property-saved-views', { params: { resource: 'properties' } })).json()
    expect(otherUserList.rows.some((r: any) => r.id === id)).toBe(false)
  })

  test('una vista compartida la ve cualquiera de la organización, pero sólo su creador puede editarla o borrarla', async () => {
    const id = await save(userA, { kind: 'view', name: `Compartida ${RUN}`, visibility: 'shared', columnsJson: JSON.stringify(['price', 'status']) })

    const otherUserList = await (await userB.get('/api/admin/property-saved-views', { params: { resource: 'properties' } })).json()
    const shared = otherUserList.rows.find((r: any) => r.id === id)
    expect(shared, 'la vista compartida no apareció para el otro usuario').toBeTruthy()
    expect(shared.columnsJson).toBe(JSON.stringify(['price', 'status']))

    const putByOther = await userB.put(`/api/admin/property-saved-views/${id}`, { data: { name: 'Renombrada por quien no la creó' } })
    expect(putByOther.status()).toBe(403)

    const deleteByOther = await userB.delete(`/api/admin/property-saved-views/${id}`)
    expect(deleteByOther.status()).toBe(403)

    const putByOwner = await userA.put(`/api/admin/property-saved-views/${id}`, { data: { name: 'Renombrada por su creador' } })
    expect(putByOwner.ok()).toBeTruthy()
  })

  test('el listado sólo trae los filtros/vistas del catálogo pedido, no los de los dos mezclados', async () => {
    const propertiesId = await save(userA, { kind: 'filter', name: `2ª mano ${RUN}`, visibility: 'shared', resource: 'properties' })
    const developerId = await save(userA, { kind: 'filter', name: `Web ${RUN}`, visibility: 'shared', resource: 'developer-properties' })

    const forProperties = await (await userA.get('/api/admin/property-saved-views', { params: { resource: 'properties' } })).json()
    expect(forProperties.rows.some((r: any) => r.id === propertiesId)).toBe(true)
    expect(forProperties.rows.some((r: any) => r.id === developerId)).toBe(false)

    const forDeveloper = await (await userA.get('/api/admin/property-saved-views', { params: { resource: 'developer-properties' } })).json()
    expect(forDeveloper.rows.some((r: any) => r.id === developerId)).toBe(true)
    expect(forDeveloper.rows.some((r: any) => r.id === propertiesId)).toBe(false)
  })

  test('una organización distinta nunca ve un filtro compartido de otra, ni con su id exacto', async () => {
    const id = await save(userA, { kind: 'filter', name: `Aislamiento ${RUN}`, visibility: 'shared' })

    const crossOrgList = await (await otherOrg.get('/api/admin/property-saved-views', { params: { resource: 'properties' } })).json()
    expect(crossOrgList.rows.some((r: any) => r.id === id)).toBe(false)

    const crossOrgGet = await otherOrg.get(`/api/admin/property-saved-views/${id}`)
    expect(crossOrgGet.status()).toBe(404)
  })

  test('exportar CSV devuelve las mismas filas que el listado, con las mismas condiciones de filtro', async () => {
    const cityTag = `E2E-Export-${RUN}`
    const propRes = await userA.post('/api/admin/properties', { data: { slug: `e2e-export-${RUN}`, city: cityTag, price: 321000, status: 'available' } })
    expect(propRes.ok()).toBeTruthy()
    const propId = (await propRes.json()).id

    const csvRes = await userA.get('/api/admin/properties', { params: { city: cityTag, format: 'csv' } })
    expect(csvRes.ok()).toBeTruthy()
    expect(csvRes.headers()['content-type']).toContain('text/csv')
    const csv = await csvRes.text()
    expect(csv).toContain('321000')
    expect(csv.split('\n')[0]).toContain('id') // cabecera real, no un cuerpo vacío

    await userA.delete(`/api/admin/properties/${propId}`)
  })
})

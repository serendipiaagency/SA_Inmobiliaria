import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * D1 rechaza cualquier consulta con más de 100 parámetros (el SQLite de los
 * tests unitarios no tiene ese límite: sólo la D1 local del e2e lo aplica).
 * Listas que el usuario puede hacer crecer — favoritos de la web pública,
 * «Exportar seleccionados», lotes de exportación — van ahora en UN parámetro
 * JSON (`inJsonList`, server/utils/sqlChunks.ts).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MANY = Array.from({ length: 150 }, (_, i) => 1_000_000 + i)

test.describe('Límite de 100 parámetros de D1', () => {
  let a: APIRequestContext
  let anon: APIRequestContext

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    anon = await pwRequest.newContext({ baseURL: BASE_URL })
  })

  test.afterAll(async () => {
    await a?.dispose()
    await anon?.dispose()
  })

  test('web pública: 150 favoritos por id no rompen el listado', async () => {
    const res = await anon.get('/api/public/properties', { params: { ids: MANY.join(',') } })
    expect(res.ok(), await res.text()).toBeTruthy()
  })

  test('panel: «Exportar seleccionados» con 150 ids en los dos catálogos', async () => {
    const list = await (await a.get('/api/admin/developer-properties', { params: { perPage: '1' } })).json()
    const real = list.rows?.[0]?.id
    for (const resource of ['developer-properties', 'properties']) {
      const res = await a.get(`/api/admin/${resource}`, { params: { ids: [...MANY, ...(real && resource === 'developer-properties' ? [real] : [])].join(','), perPage: '100' } })
      expect(res.ok(), await res.text()).toBeTruthy()
      if (real && resource === 'developer-properties') expect((await res.json()).rows.map((r: any) => r.id)).toEqual([real])
    }
  })

  test('exportación de activos: un lote de 150 ids responde con lo que es de la agencia, no con un 500', async () => {
    const templates = (await (await a.get('/api/admin/asset-export/templates')).json()) as any[]
    const pdf = templates.find((t) => String(t.formatKey || '').startsWith('pdf_'))
    test.skip(!pdf, 'no hay ninguna plantilla PDF')
    const res = await a.post('/api/admin/asset-export/batches', { data: { assetIds: MANY, templateId: pdf.id } })
    // Ningún id es de la agencia: un error de validación, nunca el 500 de «too many SQL variables».
    expect(res.status(), await res.text()).toBeLessThan(500)
  })
})

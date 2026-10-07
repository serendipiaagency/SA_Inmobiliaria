import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Abrir una pantalla del panel por su URL (o recargarla) la pinta en el
 * servidor, y ahí un `$fetch` suelto no lleva la cookie de sesión: la API
 * respondía 401. Enrutamiento y SLA salía entera como «Error 401» y
 * Automatizaciones, vacía. Navegando desde el menú no se notaba, porque eso
 * ocurre en el cliente. Se comprueba el HTML que sale del servidor.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}`

test('Enrutamiento y SLA y Automatizaciones se pintan con sus datos al abrir la URL directamente', async () => {
  const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  const created = await a.post('/api/admin/automations', {
    data: { name: `Carga directa ${RUN}`, trigger: 'lead.created', action: 'create_task', config: { title: 'Llamar a {{nombre}}', dueInHours: 2, assignee: 'none' } },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const automationId = (await created.json()).id
  try {
    const sla = await a.get('/admin/enrutamiento')
    expect(sla.status()).toBe(200)
    expect(await sla.text()).toContain('data-testid="sla-unattended-minutes"')

    const automations = await a.get('/admin/automatizaciones')
    expect(automations.status()).toBe(200)
    expect(await automations.text()).toContain(`data-testid="automation-${automationId}"`)
  } finally {
    await a.delete(`/api/admin/automations/${automationId}`)
    await a.dispose()
  }
})

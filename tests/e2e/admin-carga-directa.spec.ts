import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Abrir una pantalla del panel por su URL (o recargarla) la pinta en el
 * servidor. Navegando desde el menú no se notaba nada de esto, porque eso
 * ocurre en el cliente. Se comprueba el HTML que sale del servidor:
 *
 *  - Un `$fetch` suelto no lleva la cookie de sesión: la API respondía 401.
 *    Enrutamiento y SLA salía entera como «Error 401» y Automatizaciones,
 *    vacía.
 *  - Enrutamiento, INMO y Rendimiento no tenían `middleware: 'admin'`: se
 *    pintaban sin usuario («? Admin» en el menú, sin el filtro de permisos)
 *    y, sin sesión, sin mandar al login.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}`
const PAGES = ['/admin/enrutamiento', '/admin/automatizaciones', '/admin/inmo', '/admin/rendimiento']

test('las pantallas del panel se pintan con su usuario y sus datos al abrir la URL directamente', async () => {
  const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  const me = (await (await a.get('/api/auth/me')).json()).user
  expect(me?.email).toBeTruthy()
  const created = await a.post('/api/admin/automations', {
    data: { name: `Carga directa ${RUN}`, trigger: 'lead.created', action: 'create_task', config: { title: 'Llamar a {{nombre}}', dueInHours: 2, assignee: 'none' } },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const automationId = (await created.json()).id
  try {
    for (const path of PAGES) {
      const res = await a.get(path)
      expect(res.status(), path).toBe(200)
      // El menú lleva al usuario de la sesión, no el «Admin» de reserva.
      expect(await res.text(), path).toContain(me.email)
    }
    expect(await (await a.get('/admin/enrutamiento')).text()).toContain('data-testid="sla-unattended-minutes"')
    expect(await (await a.get('/admin/automatizaciones')).text()).toContain(`data-testid="automation-${automationId}"`)
  } finally {
    await a.delete(`/api/admin/automations/${automationId}`)
    await a.dispose()
  }

  // Sin sesión, cada una manda al login.
  const anon = await pwRequest.newContext({ baseURL: BASE_URL })
  for (const path of PAGES) {
    const res = await anon.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(302)
    expect(res.headers().location, path).toContain('/admin/login')
  }
  await anon.dispose()
})

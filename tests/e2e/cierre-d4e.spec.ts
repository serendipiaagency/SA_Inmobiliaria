import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Cierre D4e (FASE 29, email entrante), sobre HTTP real y el panel — sólo lo
 * que se puede comprobar por HTTP: el estado del email entrante en
 * Configuración → Comunicaciones y el marketplace.
 *
 * La recepción en sí (Cloudflare Email Routing → manejador `email` del
 * Worker) no pasa por HTTP y está cubierta en test/unit/inboundEmail.test.ts
 * con MIME real y la SQLite con las migraciones reales. `scripts/e2e.sh` no
 * define INBOUND_EMAIL_DOMAIN ni INBOUND_EMAIL_SECRET, así que aquí lo normal
 * es «No activo»; la prueba acepta los dos estados y comprueba que cada uno
 * dice la verdad.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

test.describe('Cierre D4e — email entrante: estado real en Configuración y marketplace', () => {
  test.use({ storageState: STATE_A })

  let a: APIRequestContext

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    await a?.dispose()
  })

  test('la API dice si está activo y qué falta, sin ningún valor secreto', async () => {
    const res = await a.get('/api/admin/comms/channels')
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = await res.json()
    const inbound = body.inboundEmail
    expect(Object.keys(inbound).sort()).toEqual(['active', 'domain', 'missing', 'routingAddress'])
    if (inbound.active) {
      expect(inbound.missing).toEqual([])
      expect(inbound.routingAddress).toBe(`respuestas@${inbound.domain}`)
    } else {
      expect(inbound.missing.length).toBeGreaterThan(0)
      expect(inbound.missing.join(' ')).toMatch(/INBOUND_EMAIL_(DOMAIN|SECRET)/)
    }
  })

  test('Configuración → Comunicaciones enseña el estado real, sin botones que no hagan nada', async ({ page }) => {
    const inbound = (await (await a.get('/api/admin/comms/channels')).json()).inboundEmail
    await page.goto('/admin/comunicaciones/configuracion')
    if (inbound.active) {
      const panel = page.getByTestId('comms-inbound-email-active')
      await expect(panel).toContainText('Activo')
      await expect(panel.locator('button')).toHaveCount(0)
    } else {
      const panel = page.getByTestId('comms-inbound-email-inactive')
      await expect(panel).toContainText('No activo')
      await expect(panel).toContainText('Email Routing')
      await expect(panel).toContainText('INBOUND_EMAIL_DOMAIN')
      await expect(panel.locator('button, a')).toHaveCount(0)
      await expect(page.getByTestId('comms-inbound-email-missing')).toBeVisible()
    }
  })

  test('marketplace: el email entrante ya no es «Próximamente» y lleva a su configuración', async ({ page }) => {
    await page.goto('/admin/marketplace')
    await expect(page.getByTestId('marketplace-app-inbound-email')).toBeVisible()
    await expect(page.getByTestId('marketplace-configure-inbound-email')).toHaveAttribute('href', '/admin/comunicaciones/configuracion')
    await expect(page.getByTestId('marketplace-upcoming-inbound-email')).toHaveCount(0)
  })
})

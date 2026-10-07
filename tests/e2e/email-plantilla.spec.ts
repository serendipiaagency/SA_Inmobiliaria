import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Plantilla maestra de los emails de Portal INMO (docs/email.md): el super
 * admin la ve en Sistemas › Emails con datos de ejemplo, en escritorio y
 * móvil, y puede mandarse una prueba (en el e2e, Resend es un simulador).
 * Nadie más puede pedir la vista previa.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'

test.describe('Plantilla de los emails de Portal INMO', () => {
  test.use({ storageState: STATE_A })

  test('la API de vista previa: plantilla maestra, remitente central y sólo para el super admin', async () => {
    const a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
    const res = await a.get('/api/admin/saas/email-health', { params: { view: 'preview', template: 'company_registration_welcome' } })
    expect(res.status(), await res.text()).toBe(200)
    const p = await res.json()
    expect(p.from).toBe('Portal INMO <info@serendipiaagency.com>')
    expect(p.subject).toBe('Te damos la bienvenida a Portal INMO')
    expect(p.html).toContain('Te damos la bienvenida a<br>Portal INMO')
    expect(p.html).toContain('href="mailto:info@serendipiaagency.com"')
    expect(p.html).toContain(`${BASE_URL}/admin/login`) // el origen real, no un localhost fijo
    expect(p.text).toContain('Acceder a mi cuenta (')
    expect((p.templates as any[]).map((t) => t.key)).toEqual(expect.arrayContaining(['company_registration_welcome', 'admin_company_registered', 'admin_company_status_changed', 'password_reset']))

    // Un email de una agencia a sus clientes no es de Portal INMO: no hay vista previa maestra.
    expect((await a.get('/api/admin/saas/email-health', { params: { view: 'preview', template: 'appointment_created' } })).status()).toBe(422)
    await a.dispose()

    // El administrador de una empresa no puede pedirla.
    const b = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    expect((await b.get('/api/admin/saas/email-health', { params: { view: 'preview' } })).status()).toBe(403)
    expect((await b.post('/api/admin/saas/settings', { data: { section: 'email-preview', template: 'password_reset' } })).status()).toBe(403)
    await b.dispose()
  })

  test('Sistemas › Emails: vista previa en escritorio y móvil, y «Enviarme una prueba» al propio correo', async ({ page }) => {
    await page.goto('/admin/emails')
    const panel = page.getByTestId('portal-email-preview')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('portal-email-subject')).toHaveText('Te damos la bienvenida a Portal INMO')
    const frame = page.frameLocator('[data-testid="portal-email-frame"]')
    await expect(frame.getByText('Conectados con tu actividad')).toBeVisible()
    await expect(frame.getByText('¿Hablamos?')).toBeVisible()

    await page.getByTestId('portal-email-template').selectOption('admin_company_registered')
    await expect(page.getByTestId('portal-email-subject')).toHaveText('Nueva empresa registrada en Portal INMO')
    await expect(frame.getByText('Nueva actividad en Portal INMO')).toBeVisible()

    await panel.getByRole('button', { name: 'Móvil' }).click()
    await expect(page.getByTestId('portal-email-frame')).toHaveCSS('width', '375px')

    const sent = page.waitForResponse((r) => r.url().includes('/api/admin/saas/settings') && r.request().method() === 'POST')
    await page.getByTestId('portal-email-send-test').click()
    const body = await (await sent).json()
    expect(body.ok).toBe(true)
    expect(body.to).toBeTruthy()
    expect(['sent', 'queued', 'not_configured', 'failed']).toContain(body.delivery)
    await expect(page.getByText(/Enviado a|queda en cola|No se ha enviado/)).toBeVisible()
  })
})

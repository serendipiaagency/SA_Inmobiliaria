import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Remitente propio de cada empresa (server/utils/email/orgSender.ts) sobre el
 * Worker real y la cuenta de Resend simulada (scripts/e2e-provider-mock.mjs):
 *
 *  - El administrador de una empresa (Skyline, org 2) registra hola@<su
 *    dominio> en Sistema → Emails, ve los registros DNS, comprueba y queda
 *    verificado. Antes de verificar, sus emails salen «vía INMO»; después, de
 *    su dirección.
 *  - Lo que envía a SUS clientes (contrato) sale de su dirección; las altas de
 *    usuario salen siempre de INMO <info@serendipiaagency.com>.
 *  - Otra empresa no puede usar ese dominio; Gmail no vale como remitente.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const MOCK_URL = process.env.E2E_PROVIDER_MOCK_URL || 'http://127.0.0.1:8799'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const DOMAIN = `ok-skyline-${RUN}.es`
const SENDER = `hola@${DOMAIN}`

async function emailsTo(address: string): Promise<any[]> {
  const all = (await (await fetch(`${MOCK_URL}/__requests`)).json()) as any[]
  return all.filter((r) => r.method === 'POST' && r.path === '/emails' && String(r.body?.to).toLowerCase() === address.toLowerCase()).map((r) => r.body)
}

test.describe.configure({ mode: 'serial' })

test.describe('Email propio de la empresa', () => {
  let tenantB: APIRequestContext
  let owner: APIRequestContext

  test.beforeAll(async () => {
    tenantB = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_B })
    owner = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })
  test.afterAll(async () => {
    // Deja a Skyline como estaba para el resto de la suite.
    await tenantB.post('/api/admin/saas/settings', { data: { section: 'email-sender', senderName: '', senderAddress: '', replyTo: '', internalRecipients: '' } })
    await tenantB.dispose()
    await owner.dispose()
  })

  test('el administrador registra su dirección, ve el DNS, comprueba y pasa a enviar desde ella', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: STATE_B })).newPage()
    await page.goto('/admin/emails')
    await expect(page.getByTestId('org-sender-panel')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByTestId('org-sender-effective')).toHaveAttribute('data-mode', 'platform')
    await expect(page.getByTestId('org-sender-from')).toContainText('vía INMO <info@serendipiaagency.com>')

    // Gmail no sirve como remitente (nadie puede verificar su DNS).
    await page.getByTestId('org-sender-address').fill('skyline@gmail.com')
    await page.getByTestId('org-sender-save').click()
    await expect(page.getByTestId('org-sender-address-error')).toContainText('Gmail')

    await page.getByTestId('org-sender-name').fill('Skyline Estates')
    await page.getByTestId('org-sender-address').fill(SENDER)
    await page.getByTestId('org-sender-reply').fill('ventas@skyline-correo.es')
    await page.getByTestId('org-sender-save').click()

    const domain = page.getByTestId('org-sender-domain')
    await expect(domain).toBeVisible()
    await expect(domain).toHaveAttribute('data-status', 'not_started')
    const records = page.getByTestId('org-sender-records')
    await expect(records).toContainText(`send.${DOMAIN}`)
    await expect(records).toContainText(`resend._domainkey.${DOMAIN}`)
    // Todavía sin verificar: vía INMO, con las respuestas a la empresa.
    await expect(page.getByTestId('org-sender-effective')).toHaveAttribute('data-mode', 'platform')
    await expect(page.getByTestId('org-sender-effective')).toContainText('ventas@skyline-correo.es')

    await page.getByTestId('org-sender-verify').click()
    await expect(domain).toHaveAttribute('data-status', 'verified')
    await expect(page.getByTestId('org-sender-effective')).toHaveAttribute('data-mode', 'own')
    await expect(page.getByTestId('org-sender-from')).toHaveText(`Skyline Estates <${SENDER}>`)
    await page.context().close()
  })

  test('lo que la empresa envía a sus clientes sale de su dirección; las altas de usuario, de INMO', async () => {
    const tpl = await tenantB.post('/api/admin/saas/contract-templates', { data: { name: `Reserva ${RUN}`, bodyTemplate: 'Contrato de reserva para {{clientName}}' } })
    expect(tpl.ok(), await tpl.text()).toBeTruthy()
    const client = `cliente-${RUN}@example.com`
    const contract = await tenantB.post('/api/admin/saas/contracts', { data: { templateId: (await tpl.json()).id, title: `Reserva ${RUN}`, clientName: 'Cliente E2E', clientEmail: client } })
    expect(contract.ok(), await contract.text()).toBeTruthy()
    const sent = await tenantB.post(`/api/admin/saas/contracts/${(await contract.json()).id}/send`)
    expect(sent.ok(), await sent.text()).toBeTruthy()
    const [toClient] = await emailsTo(client)
    expect(toClient.from).toBe(`Skyline Estates <${SENDER}>`)
    expect(toClient.reply_to).toBe('ventas@skyline-correo.es')

    const newUser = `empleado-${RUN}@example.com`
    const created = await tenantB.post('/api/admin/users', { data: { name: 'Empleado E2E', email: newUser, password: 'TempPass123!', role: 'user' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const [welcome] = await emailsTo(newUser)
    expect(welcome.from).toBe('INMO <info@serendipiaagency.com>')
  })

  test('otra empresa no puede usar ese dominio, ni siquiera con otra dirección', async () => {
    const res = await owner.post('/api/admin/saas/settings', { data: { section: 'email-sender', senderAddress: `ventas@${DOMAIN}` } })
    expect(res.status()).toBe(409)
    expect((await res.json()).error).toMatchObject({ field: 'senderAddress' })
  })

  test('un dominio dado de alta a mano en Resend sólo lo asigna un super admin', async () => {
    const res = await tenantB.post('/api/admin/saas/settings', { data: { section: 'email-sender', senderAddress: 'hola@ajeno-preexistente.es' } })
    expect(res.status()).toBe(409)
  })

  test('el super admin ve y gestiona el remitente de una empresa desde su ficha; un admin no puede tocar otra empresa', async ({ browser }) => {
    const view = await owner.get('/api/admin/saas/email-health', { params: { view: 'sender', organizationId: '2' } })
    expect(view.ok()).toBeTruthy()
    expect((await view.json()).effective).toMatchObject({ mode: 'own', fromHeader: `Skyline Estates <${SENDER}>` })
    expect((await tenantB.get('/api/admin/saas/email-health', { params: { view: 'sender', organizationId: '1' } })).status()).toBe(403)
    expect((await tenantB.post('/api/admin/saas/settings', { data: { section: 'email-sender', organizationId: 1, senderAddress: 'x@y.es' } })).status()).toBe(403)

    const page = await (await browser.newContext({ storageState: STATE_A })).newPage()
    await page.goto('/admin/organizations/2')
    await expect(page.getByTestId('org-editor')).toHaveAttribute('data-ready', 'true')
    await page.getByTestId('org-section-email').click()
    await expect(page.getByTestId('org-sender-from')).toHaveText(`Skyline Estates <${SENDER}>`)
    await page.context().close()
  })
})

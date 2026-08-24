import { test, expect, request as pwRequest } from '@playwright/test'
import { STATE_A } from './global-setup'

const AGENT_SLUG = 'perla-maria-melgarejo'

/**
 * A random future day (every day of the week is opened 09:00-18:00 by this
 * file's own beforeAll) and a random half-hour slot within that window —
 * randomized, not a fixed date/time, so re-running this suite (repeated CI
 * runs, local iteration) never collides with a slot a previous run already
 * booked on the same persistent D1.
 */
function randomFutureSlot() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 + Math.floor(Math.random() * 50))
  const dateStr = d.toISOString().slice(0, 10)
  const hour = 9 + Math.floor(Math.random() * 9) // 09..17
  const minute = Math.random() < 0.5 ? '00' : '30'
  return { dateStr, start: `${dateStr} ${String(hour).padStart(2, '0')}:${minute}:00` }
}

test.describe('Agenda de citas con agentes', () => {
  // Reuses the session from global-setup.ts rather than logging in again —
  // /api/auth/login is IP rate-limited and the whole suite shares one address.
  test.beforeAll(async () => {
    const admin = await pwRequest.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:8788',
      storageState: STATE_A,
    })

    const agents = await admin.get('/api/admin/saas/agents')
    const { rows } = await agents.json()
    const agent = rows.find((a: any) => a.slug === AGENT_SLUG)
    expect(agent).toBeTruthy()

    const put = await admin.put(`/api/admin/saas/agents/${agent.id}/availability`, {
      data: {
        slotDurationMinutes: 30,
        rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })),
      },
    })
    expect(put.ok()).toBeTruthy()
    await admin.dispose()
  })

  test('GET availability devuelve huecos reales dentro del horario configurado', async ({ request }) => {
    const { dateStr } = randomFutureSlot()
    const res = await request.get(`/api/public/agents/${AGENT_SLUG}/availability`, { params: { from: dateStr, days: 1 } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.days[0].slots.length).toBeGreaterThan(0)
    expect(body.days[0].slots[0].start.startsWith(dateStr)).toBe(true)
  })

  test('reservar un hueco real funciona, y repetirlo devuelve 409', async ({ request }) => {
    const { start } = randomFutureSlot()
    const first = await request.post(`/api/public/agents/${AGENT_SLUG}/book`, {
      data: { name: 'E2E Cliente', email: 'e2e-cliente@example.com', startAt: start },
    })
    expect(first.status()).toBe(200)

    const second = await request.post(`/api/public/agents/${AGENT_SLUG}/book`, {
      data: { name: 'E2E Cliente Duplicado', email: 'e2e-duplicado@example.com', startAt: start },
    })
    expect(second.status()).toBe(409)
  })

  test('reservar fuera de la ventana de trabajo devuelve 409', async ({ request }) => {
    const { dateStr } = randomFutureSlot()
    const res = await request.post(`/api/public/agents/${AGENT_SLUG}/book`, {
      data: { name: 'Fuera de horario', email: 'fuera-horario@example.com', startAt: `${dateStr} 23:00:00` },
    })
    expect(res.status()).toBe(409)
  })

  test('reservar sin email ni teléfono devuelve 422', async ({ request }) => {
    const nextSlot = new Date()
    nextSlot.setUTCDate(nextSlot.getUTCDate() + 21)
    const res = await request.post(`/api/public/agents/${AGENT_SLUG}/book`, {
      data: { name: 'Sin contacto', startAt: `${nextSlot.toISOString().slice(0, 10)} 09:00:00` },
    })
    expect(res.status()).toBe(422)
  })

  test('el perfil público del agente abre el selector de citas y permite reservar de extremo a extremo', async ({ page }) => {
    await page.goto(`/equipo/${AGENT_SLUG}`)
    await page.getByRole('button', { name: /reservar cita/i }).click()

    const slotButton = page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first()
    await expect(slotButton).toBeVisible({ timeout: 10_000 })
    await slotButton.click()

    await page.getByLabel(/nombre/i).fill('E2E Playwright UI')
    await page.getByLabel(/email/i).fill('e2e-ui@example.com')
    await page.getByRole('button', { name: /confirmar cita/i }).click()

    await expect(page.getByText(/cita confirmada/i)).toBeVisible({ timeout: 10_000 })
  })
})

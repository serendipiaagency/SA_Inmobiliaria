import { test, expect, type Page } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Fragmentos de JS de un despliegue anterior (plugins/chunk-reload.client.ts):
 * en la web pública, un fragmento que falta fuera de una navegación recarga
 * la página una vez (y no otra en el minuto siguiente); en el panel no se
 * recarga nunca sola. El fallo se simula con el mismo evento que lanza Vite
 * cuando no encuentra un fragmento (`vite:preloadError`).
 */

async function hydrated(page: Page) {
  await page.waitForFunction(() => (window as any).useNuxtApp?.()?.isHydrating === false)
}
async function failChunk(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__antesDeRecargar = true
    const ev = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: Error }
    ev.payload = new Error('Failed to fetch dynamically imported module: /_nuxt/viejo.js')
    window.dispatchEvent(ev)
  })
}
const stillSamePage = (page: Page) => page.evaluate(() => (window as any).__antesDeRecargar === true).catch(() => false)

test.describe('Fragmentos de un despliegue anterior', () => {
  test('web pública: recarga una vez la misma página, sin bucles', async ({ page }) => {
    await page.goto('/nosotros?origen=prueba')
    await hydrated(page)
    await page.evaluate(() => sessionStorage.removeItem('nuxt:reload'))

    const reloaded = page.waitForEvent('load')
    await failChunk(page)
    await reloaded
    await hydrated(page)
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/nosotros?origen=prueba')
    expect(await stillSamePage(page)).toBe(false)

    // Si vuelve a fallar en seguida (el fragmento sigue sin llegar), no se recarga otra vez.
    await failChunk(page)
    await page.waitForTimeout(1500)
    expect(await stillSamePage(page)).toBe(true)
  })

  test.describe('panel', () => {
    test.use({ storageState: STATE_A })
    test('en el panel no recarga sola (podría haber cambios sin guardar)', async ({ page }) => {
      await page.goto('/admin/leads')
      await hydrated(page)
      await page.evaluate(() => sessionStorage.removeItem('nuxt:reload'))
      await failChunk(page)
      await page.waitForTimeout(1500)
      expect(await stillSamePage(page)).toBe(true)
      expect(new URL(page.url()).pathname).toBe('/admin/leads')
    })
  })
})

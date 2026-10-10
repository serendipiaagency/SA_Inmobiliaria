#!/usr/bin/env node
/**
 * Capturas REALES de la landing comercial de INMO (utils/landing.ts →
 * public/landing/<clave>.webp), tomadas de la cuenta de demostración
 * («Norte Astur Inmobiliaria», datos sintéticos) en un servidor LOCAL.
 *
 * Nunca contra producción: el script crea la cuenta demo (como super admin
 * del arranque local), entra como su gerente y fotografía el panel, el
 * Constructor Web, el CRM, el editor de una propiedad, la agenda, las
 * operaciones y la web pública (portada, ficha, contacto, móvil). Ninguna
 * pantalla se dibuja a mano: si algo falla, falta la captura y la landing
 * enseña el hueco con su aviso (components/landing/LpShot.vue).
 *
 * Uso (levanta el build, una D1 limpia y wrangler dev, y lo apaga al acabar):
 *
 *   E2E_RUN='node scripts/capturas-landing.mjs' bash scripts/e2e.sh
 *
 * O contra un `wrangler dev --local` ya levantado con las mismas variables
 * que scripts/e2e.sh (DEMO_ADMIN_PASSWORD_HASH incluida):
 *
 *   E2E_BASE_URL=http://localhost:8788 node scripts/capturas-landing.mjs
 *
 * Las credenciales son las del arranque local (tests/e2e/global-setup.ts y
 * la contraseña de prueba de la gerente demo de scripts/e2e.sh); no existen
 * en producción.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, request } from '@playwright/test'
import sharp from 'sharp'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const OUT_DIR = join(import.meta.dirname, '../public/landing')
const OWNER = { email: process.env.CAPTURAS_ADMIN_EMAIL || 'admin@sa-inmobiliaria.com', password: process.env.CAPTURAS_ADMIN_PASSWORD || 'ChangeMe123!' }
const MANAGER = { email: 'demo@portalinmo', password: process.env.CAPTURAS_DEMO_PASSWORD || 'E2e-Demo-Placeholder-1!' }
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
/** Ancho final de los archivos: ~1.4× para que se vean nítidas en pantallas densas sin pesar como un 2×. */
const DESKTOP_OUT_WIDTH = 2000
const MOBILE_OUT_WIDTH = 780

const log = (msg) => console.log(`[capturas] ${msg}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureDemo(owner) {
  let progress = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-status' } })).json()
  if (progress.status !== 'ready') {
    log('creando la cuenta de demostración…')
    progress = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-create' } })).json()
    for (let i = 0; i < 300 && (progress.status === 'provisioning' || progress.status === 'resetting'); i++) {
      const res = await owner.post('/api/admin/organizations', { data: { action: 'demo-advance' } })
      if (!res.ok()) throw new Error(`demo-advance: ${res.status()} ${await res.text()}`)
      progress = await res.json()
      if (i % 10 === 0) log(`  tramo ${i}: ${progress.status} ${progress.step || ''}`)
    }
  }
  if (progress.status !== 'ready' || progress.error) throw new Error(`La demo no quedó lista: ${JSON.stringify(progress)}`)
  return progress.orgId
}

async function login(ctx, who) {
  const res = await ctx.post('/api/auth/login', { data: { email: who.email, password: who.password } })
  if (!res.ok()) throw new Error(`login ${who.email}: ${res.status()} ${await res.text()}`)
}

/** Acepta el aviso de cookies y quita lo que no es la pantalla (barras de scroll). */
async function settle(page, { wait = 1200 } = {}) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} html{scrollbar-width:none}' }).catch(() => {})
  const accept = page.getByTestId('cookie-accept')
  if (await accept.isVisible().catch(() => false)) {
    await accept.click()
    await sleep(300)
  }
  await sleep(wait)
}

async function shoot(page, key, outWidth) {
  const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' })
  const webp = await sharp(png).resize({ width: outWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const file = join(OUT_DIR, `${key}.webp`)
  writeFileSync(file, webp)
  const meta = await sharp(webp).metadata()
  log(`${key}.webp ${meta.width}×${meta.height} ${(webp.length / 1024).toFixed(0)} KB`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const owner = await request.newContext({ baseURL: BASE_URL })
  await login(owner, OWNER)
  const orgId = await ensureDemo(owner)
  log(`cuenta demo lista (empresa ${orgId})`)

  const browser = await chromium.launch()
  const failures = []
  const run = async (key, fn) => {
    try {
      await fn()
    } catch (e) {
      failures.push(key)
      console.error(`[capturas] ${key}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Escritorio, como la gerente de la demo.
  const desktop = await browser.newContext({ baseURL: BASE_URL, viewport: DESKTOP, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', reducedMotion: 'reduce' })
  await login(desktop.request, MANAGER)
  const props = await (await desktop.request.get('/api/admin/properties', { params: { pageSize: '50' } })).json()
  const rows = props.rows ?? props
  const property = rows.find((p) => p.mainImage && p.slug) || rows[0]
  if (!property) throw new Error('La demo no tiene propiedades de 2ª mano')
  const page = await desktop.newPage()

  await run('panel', async () => {
    await page.goto('/admin')
    await settle(page)
    await shoot(page, 'panel', DESKTOP_OUT_WIDTH)
  })
  await run('crm', async () => {
    await page.goto('/admin/leads')
    await settle(page)
    await shoot(page, 'crm', DESKTOP_OUT_WIDTH)
  })
  await run('propiedad-panel', async () => {
    await page.goto(`/admin/properties/${property.id}`)
    await settle(page, { wait: 1800 })
    await shoot(page, 'propiedad-panel', DESKTOP_OUT_WIDTH)
  })
  await run('agenda', async () => {
    await page.goto('/admin/visitas')
    await settle(page)
    await shoot(page, 'agenda', DESKTOP_OUT_WIDTH)
  })
  await run('operaciones', async () => {
    await page.goto('/admin/deal-operations')
    await settle(page)
    await shoot(page, 'operaciones', DESKTOP_OUT_WIDTH)
  })
  await run('constructor', async () => {
    await page.goto('/admin/site-builder')
    await page.frameLocator('iframe').locator('header, main, body').first().waitFor({ timeout: 30_000 })
    await settle(page, { wait: 2500 })
    await shoot(page, 'constructor', DESKTOP_OUT_WIDTH)
  })

  // La web pública de la demo, en vista previa (sólo la ve su equipo).
  await run('web-portada', async () => {
    await page.goto(`/?vista_previa=${orgId}`)
    await settle(page, { wait: 1800 })
    await shoot(page, 'web-portada', DESKTOP_OUT_WIDTH)
  })
  await run('ficha-publica', async () => {
    // La ficha pública es la del catálogo de la web (obra nueva): se elige una
    // de las que la propia web de la demo enseña, ya en vista previa.
    const listing = await (await desktop.request.get('/api/public/properties', { params: { pageSize: '24' } })).json()
    const items = listing.rows ?? listing.items ?? listing.properties ?? (Array.isArray(listing) ? listing : [])
    const live = items.find((p) => p.slug && (p.mainImage || p.image || p.cover)) || items.find((p) => p.slug)
    if (!live) throw new Error('La web de la demo no enseña ninguna propiedad con ficha pública')
    await page.goto(`/propiedades/${live.slug}`)
    await settle(page, { wait: 1800 })
    if ((await page.locator('text=Esta página no existe').count()) > 0) throw new Error(`La ficha /propiedades/${live.slug} responde 404`)
    await shoot(page, 'ficha-publica', DESKTOP_OUT_WIDTH)
  })
  await run('web-contacto', async () => {
    await page.goto('/contacto')
    await settle(page)
    await shoot(page, 'web-contacto', DESKTOP_OUT_WIDTH)
  })
  await desktop.close()

  // Móvil: la portada de la web de la demo.
  await run('movil', async () => {
    const mobile = await browser.newContext({ baseURL: BASE_URL, viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid', reducedMotion: 'reduce' })
    await login(mobile.request, MANAGER)
    const m = await mobile.newPage()
    await m.goto(`/?vista_previa=${orgId}`)
    await settle(m, { wait: 1800 })
    await shoot(m, 'movil', MOBILE_OUT_WIDTH)
    await mobile.close()
  })

  await browser.close()
  await owner.dispose()
  if (failures.length) {
    console.error(`[capturas] fallaron: ${failures.join(', ')}`)
    process.exit(1)
  }
  log('listo: public/landing/*.webp')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Graba un vídeo REAL de la web pública de la cuenta de demostración
 * («Norte Astur Inmobiliaria») desplazándose por sus secciones, para la
 * pestaña «Web publicada» del bloque «Una web a la altura de tus propiedades»
 * de la landing (components/landing/LpBuilder.vue).
 *
 * Como scripts/capturas-landing.mjs: NUNCA contra producción. Se levanta un
 * servidor local con la demo y se entra como su gerente. El .webm crudo queda
 * en RAW_DIR; luego scripts/encode-webpublicada.sh lo optimiza a mp4/webm +
 * póster en public/landing.
 *
 * Uso:  E2E_RUN='node scripts/record-webpublicada.mjs' bash scripts/e2e.sh
 */
import { mkdirSync } from 'node:fs'
import { chromium, request } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RAW_DIR = process.env.RECORD_OUT_DIR || '/tmp/claude-0/-home-user-SA-Inmobiliaria/f61d1155-3a77-5522-81ab-109e654e709b/scratchpad/webvideo'
const OWNER = { email: process.env.CAPTURAS_ADMIN_EMAIL || 'admin@sa-inmobiliaria.com', password: process.env.CAPTURAS_ADMIN_PASSWORD || 'ChangeMe123!' }
const MANAGER = { email: 'demo@portalinmo', password: process.env.CAPTURAS_DEMO_PASSWORD || 'E2e-Demo-Placeholder-1!' }
const SIZE = { width: 1280, height: 800 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`[record] ${m}`)

async function login(ctx, who) {
  const res = await ctx.post('/api/auth/login', { data: { email: who.email, password: who.password } })
  if (!res.ok()) throw new Error(`login ${who.email}: ${res.status()} ${await res.text()}`)
}

async function ensureDemo(owner) {
  let p = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-status' } })).json()
  if (p.status !== 'ready') {
    log('creando la cuenta de demostración…')
    if (p.status !== 'provisioning' && p.status !== 'resetting' && p.status !== 'snapshotting') {
      p = await (await owner.post('/api/admin/organizations', { data: { action: 'demo-create' } })).json()
    }
    // Avanza hasta «ready» sea cual sea el estado intermedio (provisioning, snapshotting, resetting…).
    for (let i = 0; i < 500 && p.status !== 'ready' && !p.error; i++) {
      const res = await owner.post('/api/admin/organizations', { data: { action: 'demo-advance' } })
      if (!res.ok()) throw new Error(`demo-advance: ${res.status()} ${await res.text()}`)
      p = await res.json()
      if (i % 20 === 0) log(`  tramo ${i}: ${p.status} ${p.step || ''}`)
    }
  }
  if (p.status !== 'ready' || p.error) throw new Error(`La demo no quedó lista: ${JSON.stringify(p)}`)
  return p.orgId
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true })
  const owner = await request.newContext({ baseURL: BASE_URL })
  await login(owner, OWNER)
  const orgId = await ensureDemo(owner)
  log(`cuenta demo lista (empresa ${orgId})`)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    viewport: SIZE,
    deviceScaleFactor: 2, // nítida en pantallas densas; luego el vídeo se escala
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  })
  await login(ctx.request, MANAGER)
  const page = await ctx.newPage()
  await page.goto(`/?vista_previa=${orgId}`, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  const accept = page.getByTestId('cookie-accept')
  if (await accept.isVisible().catch(() => false)) { await accept.click(); await sleep(300) }
  // Neutraliza barras de scroll, scroll-behavior, cabeceras fijas y widgets
  // flotantes para que la captura de PÁGINA COMPLETA salga limpia y sin repetir
  // elementos pegajosos.
  await page.addStyleTag({ content: `
    ::-webkit-scrollbar{display:none} html{scrollbar-width:none}
    html,body,*{scroll-behavior:auto !important}
    header,[class*="sticky"],[style*="position: fixed"],[style*="position:fixed"]{position:static !important}
    [data-testid="web-chat-widget"],.web-chat-widget,[class*="chat-widget"],[class*="ChatWidget"]{display:none !important}
  ` }).catch(() => {})
  await sleep(600)

  // Pre-pase: baja en pasos para forzar la carga diferida de todas las imágenes
  // y fijar el alto real, y vuelve arriba, antes de la captura de página completa.
  await page.evaluate(async () => {
    const el = document.scrollingElement || document.documentElement
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (let y = 0; y <= el.scrollHeight; y += Math.max(400, window.innerHeight * 0.75)) { el.scrollTop = y; await wait(120) }
    await wait(800)
    el.scrollTop = 0
    await wait(600)
  })
  await sleep(500)

  // Captura de PÁGINA COMPLETA de la web real: una imagen alta con todas las
  // secciones. El vídeo (desplazamiento) se genera luego con ffmpeg paneando
  // sobre ella (scripts/encode-webpublicada.sh).
  const outPng = `${RAW_DIR}/norte-astur-fullpage.png`
  await page.screenshot({ path: outPng, fullPage: true, animations: 'disabled', timeout: 60000 })
  await ctx.close()
  await browser.close()
  await owner.dispose()
  log(`captura de página completa: ${outPng}`)
}

main().catch((e) => { console.error('[record] FALLÓ:', e); process.exit(1) })

#!/usr/bin/env node
/**
 * Post-deploy smoke tests — the last gate in the deploy pipeline
 * (.github/workflows/deploy.yml), run once against the URL that was *just*
 * deployed (staging or production). Purpose-built to be fast (a handful of
 * real HTTP requests, no browser) and to fail loudly and specifically: each
 * check names exactly which surface broke, since "the deploy is bad" isn't
 * actionable at 3am but "the D1 binding is broken" is.
 *
 * Usage: node scripts/smoke-test.mjs <base-url>
 *        SMOKE_BASE_URL=https://sa-inmobiliaria.example.workers.dev node scripts/smoke-test.mjs
 */
const BASE_URL = (process.argv[2] || process.env.SMOKE_BASE_URL || '').replace(/\/$/, '')
if (!BASE_URL) {
  console.error('Uso: node scripts/smoke-test.mjs <base-url>  (o variable SMOKE_BASE_URL)')
  process.exit(2)
}

const TIMEOUT_MS = 15_000
let failures = 0

async function fetchWithTimeout(path) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${BASE_URL}${path}`, { signal: controller.signal, redirect: 'manual' })
  } finally {
    clearTimeout(t)
  }
}

async function check(name, path, assertFn) {
  try {
    const res = await fetchWithTimeout(path)
    await assertFn(res)
    console.log(`✓ ${name} (${path}) — ${res.status}`)
  } catch (err) {
    failures++
    console.error(`✗ ${name} (${path}): ${err.message}`)
  }
}

function expectStatus(res, ...allowed) {
  if (!allowed.includes(res.status)) throw new Error(`esperaba ${allowed.join(' o ')}, recibió ${res.status}`)
}

async function main() {
  console.log(`Smoke tests contra ${BASE_URL}\n`)

  await check('Health: liveness', '/api/health/live', (res) => expectStatus(res, 200))
  await check('Health: readiness (D1 + R2 alcanzables)', '/api/health/ready', (res) => expectStatus(res, 200))
  await check('Home', '/', (res) => expectStatus(res, 200))
  await check('Login de administración carga', '/admin/login', (res) => expectStatus(res, 200))
  await check('Catálogo de propiedades carga', '/propiedades', (res) => expectStatus(res, 200))

  // API pública + binding D1: si el binding estuviera roto esto daría 500,
  // no un array vacío — un catálogo vacío es un resultado válido, un error
  // de servidor no lo es.
  let firstSlug = null
  await check('API pública /api/public/properties responde y usa D1', '/api/public/properties?perPage=1', async (res) => {
    expectStatus(res, 200)
    const body = await res.json()
    if (!Array.isArray(body.rows)) throw new Error('la respuesta no tiene la forma esperada { rows, total }')
    firstSlug = body.rows[0]?.slug || null
  })

  if (firstSlug) {
    await check('Ficha de propiedad real carga', `/propiedades/${firstSlug}`, (res) => expectStatus(res, 200))
  } else {
    console.log('… (sin propiedades publicadas todavía — se omite la comprobación de ficha de propiedad)')
  }

  // R2: una clave que no existe debe dar 404 (el binding respondió y supo
  // decir "no está"), nunca 500 (el binding en sí está roto/mal configurado).
  await check('Binding R2 responde correctamente a una clave inexistente', '/api/media/__smoke-test-key-that-should-not-exist__', (res) =>
    expectStatus(res, 404),
  )

  await check('API v1 pública exige autenticación (binding + rutas vivas)', '/api/v1/properties', (res) => expectStatus(res, 401))

  console.log('')
  if (failures > 0) {
    console.error(`${failures} comprobación(es) fallaron.`)
    process.exit(1)
  }
  console.log('Todas las comprobaciones pasaron.')
}

main()

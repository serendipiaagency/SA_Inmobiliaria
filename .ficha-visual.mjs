// Capturas locales de la ficha (#107) para compararlas con la referencia de
// «Atendido por»: crea en la base local una promotora, un comercial y una
// propiedad, y fotografía la tarjeta a 1440 px y a 390 px.
import { chromium, request } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:8795'
const OUT = process.env.OUT
const RUN = Date.now()
const api = await request.newContext({ baseURL: BASE })
const login = await api.post('/api/auth/login', { data: { email: 'admin@sa-inmobiliaria.com', password: 'ChangeMe123!' } })
if (!login.ok()) throw new Error(`login ${login.status()}`)
const dev = await (await api.post('/api/admin/developers', { data: { name: `Visual ${RUN}`, email: `v-${RUN}@mm.test`, status: 'active' } })).json()
const tm = await (await api.post('/api/admin/team', { data: { name: 'Perla Maria Melgarejo', email: `p-${RUN}@mm.test`, position: 'Asesora inmobiliaria', phone: '+34 600 111 222', whatsapp: '+34 600 111 222', employmentStatus: 'active', showOnWeb: 1 } })).json()
const prop = await (await api.post('/api/admin/developer-properties', { data: { developerId: dev.id, name: `Piso luminoso ${RUN}`, status: 'new', price: 185000, bedrooms: 2, bathrooms: 1, area: 78, propertyType: 'Apartment', yearBuilt: 2026, hasElevator: 1, hasGarage: 1, hasTerrace: 1, hasPool: 1, hasGarden: 1, accessible: 1, agentId: tm.id, community: `Visual ${RUN}` } })).json()
const { row } = await (await api.get(`/api/admin/developer-properties/${prop.id}`)).json()
const browser = await chromium.launch()
for (const [w, h, tag] of [[1440, 1900, 'desk'], [390, 2400, 'movil']]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage()
  await page.goto(`${BASE}/propiedades/${row.slug}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /rechazar no esenciales/i }).click().catch(() => {})
  await page.waitForTimeout(400)
  const card = page.getByTestId('property-contact-card')
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: `${OUT}/ficha-card-${tag}.png` })
  const box = await card.boundingBox()
  console.log(tag, 'tarjeta', Math.round(box.width), 'x', Math.round(box.height))
  await page.getByTestId('quick-facts').screenshot({ path: `${OUT}/ficha-datos-${tag}.png` })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log(tag, 'desbordamiento horizontal', overflow)
}
await browser.close()

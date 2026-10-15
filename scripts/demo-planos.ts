/**
 * Dibuja los planos de demostración de las propiedades de referencia de la
 * cuenta demo (public/demo-assets/norte-astur/planos/) a partir de las MISMAS
 * estancias que enseña su ficha (server/demo/dataset/referencia.ts): cada
 * habitación se dibuja con una superficie proporcional a sus m² y lleva su
 * nombre y su superficie, así que el plano no puede contradecir a la ficha.
 *
 * Son esquemas, no planos de arquitecto: llevan el rótulo «PLANO DE
 * DEMOSTRACIÓN — SIN VALIDEZ LEGAL». Las terrazas, el porche, el garaje y los
 * trasteros (fuera de la superficie útil) van aparte, con trazo discontinuo.
 *
 *   npx jiti scripts/demo-planos.ts
 *
 * Usa el Chromium de Playwright para convertir el SVG en PNG. Los PNG se
 * versionan: sólo hay que volver a ejecutarlo si cambian las estancias.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { DEMO_DISCLAIMER, REFERENCE_CONTENT, isUsableRoom, type ReferenceRoom } from '../server/demo/dataset/referencia'
import { PROPERTIES } from '../server/demo/dataset/properties'

const OUT = join(process.cwd(), 'public/demo-assets/norte-astur/planos')
const W = 1200
const H = 860
const PX_PER_M = 38

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (v: number) => String(v).replace('.', ',')

interface Rect {
  room: ReferenceRoom
  x: number
  y: number
  w: number
  h: number
}

/** Reparte las estancias en el rectángulo con áreas proporcionales (corte binario por el lado más largo). */
function slice(rooms: ReferenceRoom[], x: number, y: number, w: number, h: number): Rect[] {
  if (rooms.length === 1) return [{ room: rooms[0]!, x, y, w, h }]
  const sorted = [...rooms].sort((a, b) => b.area - a.area)
  const total = sorted.reduce((s, r) => s + r.area, 0)
  const a: ReferenceRoom[] = []
  let sumA = 0
  for (const r of sorted) {
    if (sumA < total / 2 || a.length === 0) {
      a.push(r)
      sumA += r.area
    }
  }
  const b = sorted.filter((r) => !a.includes(r))
  const ratio = sumA / total
  if (w >= h) return [...slice(a, x, y, w * ratio, h), ...slice(b, x + w * ratio, y, w * (1 - ratio), h)]
  return [...slice(a, x, y, w, h * ratio), ...slice(b, x, y + h * ratio, w, h * (1 - ratio))]
}

function label(r: Rect): string {
  const minDim = Math.min(r.w, r.h)
  const fs = Math.max(9, Math.min(15, minDim / 5.2))
  const maxChars = Math.max(6, Math.floor(r.w / (fs * 0.55)))
  const words = r.room.name.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxChars && cur) {
      lines.push(cur)
      cur = word
    } else cur = (cur + ' ' + word).trim()
  }
  if (cur) lines.push(cur)
  const text = [...lines, `${fmt(r.room.area)} m²`]
  const lh = fs * 1.2
  const top = r.y + r.h / 2 - ((text.length - 1) * lh) / 2
  return text.map((t, i) => `<text x="${r.x + r.w / 2}" y="${top + i * lh + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-weight="${i === text.length - 1 ? 700 : 500}" fill="#1c1b19">${esc(t)}</text>`).join('')
}

function planSvg(title: string, subtitle: string, rooms: ReferenceRoom[]): string {
  const usable = rooms.filter(isUsableRoom)
  const outdoor = rooms.filter((r) => !isUsableRoom(r))
  const total = usable.reduce((s, r) => s + r.area, 0)
  const wM = Math.sqrt(total * 1.45)
  const planW = Math.round(wM * PX_PER_M)
  const planH = Math.round((total / wM) * PX_PER_M)
  const ox = 70
  const oy = 130
  const rects = slice(usable, ox, oy, planW, planH)
  const body = rects
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#faf8f4" stroke="#1c1b19" stroke-width="3"/>${label(r)}`)
    .join('')
  // Exteriores a la derecha, en columna, con sus m² en proporción.
  let oyCursor = oy
  const side = outdoor
    .map((r) => {
      const area = r.area * PX_PER_M * PX_PER_M
      const w = Math.min(260, Math.max(120, Math.sqrt(area * 1.6)))
      const h = Math.max(40, area / w)
      const rect: Rect = { room: r, x: ox + planW + 50, y: oyCursor, w, h }
      oyCursor += h + 14
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#f1f6ef" stroke="#4d5a47" stroke-width="2.5" stroke-dasharray="9 6"/>${label(rect)}`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect width="${W}" height="38" fill="#fbf5e4"/>
<text x="${W / 2}" y="25" text-anchor="middle" font-size="16" font-weight="700" fill="#6b5218">PLANO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL</text>
<text x="70" y="82" font-size="26" font-weight="700" fill="#1c1b19">${esc(title)}</text>
<text x="70" y="108" font-size="15" fill="#57534e">${esc(subtitle)}</text>
${body}${side}
<text x="${ox}" y="${H - 54}" font-size="14" fill="#57534e">Superficie útil de esta planta: ${fmt(total)} m². Las estancias están dibujadas en proporción a su superficie; el trazo discontinuo marca los espacios fuera de la superficie útil.</text>
<text x="${ox}" y="${H - 28}" font-size="12" fill="#78716c">Esquema orientativo de la cuenta demo (Norte Astur Inmobiliaria). Las cotas y la distribución no son las de un proyecto real.</text>
</svg>`
}

function masterPlanSvg(): string {
  const p = PROPERTIES.find((x) => x.key === 'p10')!
  const plot = p.plotArea!
  const garden = p.gardenArea!
  const footprint = plot - garden
  const wM = Math.sqrt(plot * 1.4)
  const hM = plot / wM
  const k = Math.min(780 / wM, 520 / hM)
  const pw = wM * k
  const ph = hM * k
  const ox = 70
  const oy = 140
  const hwM = Math.sqrt(footprint * 1.35)
  const hhM = footprint / hwM
  const hx = ox + pw / 2 - (hwM * k) / 2
  const hy = oy + 24
  const poolW = 8 * k
  const poolH = 4 * k
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect width="${W}" height="38" fill="#fbf5e4"/>
<text x="${W / 2}" y="25" text-anchor="middle" font-size="16" font-weight="700" fill="#6b5218">PLANO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL</text>
<text x="70" y="82" font-size="26" font-weight="700" fill="#1c1b19">Esquema de la parcela</text>
<text x="70" y="108" font-size="15" fill="#57534e">${esc(p.title)} · parcela de ${fmt(plot)} m²</text>
<rect x="${ox}" y="${oy}" width="${pw}" height="${ph}" fill="#eef5ea" stroke="#4d5a47" stroke-width="3" stroke-dasharray="12 7"/>
<text x="${ox + 14}" y="${oy + ph - 16}" font-size="15" font-weight="700" fill="#33402f">Jardín privado · ${fmt(garden)} m²</text>
<rect x="${hx}" y="${hy}" width="${hwM * k}" height="${hhM * k}" fill="#faf8f4" stroke="#1c1b19" stroke-width="3"/>
<text x="${hx + (hwM * k) / 2}" y="${hy + (hhM * k) / 2 - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#1c1b19">Vivienda</text>
<text x="${hx + (hwM * k) / 2}" y="${hy + (hhM * k) / 2 + 18}" text-anchor="middle" font-size="14" fill="#1c1b19">huella aproximada de ${fmt(footprint)} m²</text>
<rect x="${hx + (hwM * k) / 2 - poolW / 2}" y="${hy + hhM * k + 38}" width="${poolW}" height="${poolH}" fill="#d9ecf5" stroke="#2b6a86" stroke-width="2.5"/>
<text x="${hx + (hwM * k) / 2}" y="${hy + hhM * k + 38 + poolH / 2 + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#1e4b60">Piscina</text>
<text x="${ox + pw + 40}" y="${oy + 20}" font-size="15" font-weight="700" fill="#1c1b19">Datos de la ficha</text>
<text x="${ox + pw + 40}" y="${oy + 46}" font-size="14" fill="#44403c">Parcela: ${fmt(plot)} m²</text>
<text x="${ox + pw + 40}" y="${oy + 68}" font-size="14" fill="#44403c">Jardín: ${fmt(garden)} m²</text>
<text x="${ox + pw + 40}" y="${oy + 90}" font-size="14" fill="#44403c">Ocupado por la vivienda y accesos: ${fmt(footprint)} m²</text>
<text x="${ox}" y="${H - 28}" font-size="12" fill="#78716c">Esquema orientativo de la cuenta demo (Norte Astur Inmobiliaria). La disposición no es la de un proyecto real.</text>
</svg>`
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const jobs: { file: string; svg: string }[] = []
  for (const c of REFERENCE_CONTENT) {
    const prop = PROPERTIES.find((x) => x.key === c.key)!
    for (const plan of c.plans) {
      const rooms = c.rooms.filter((r) => plan.floors.includes(r.floor))
      jobs.push({ file: plan.file, svg: planSvg(plan.title, `${prop.title} · ${plan.sizes}`, rooms) })
    }
  }
  jobs.push({ file: 'planos/p10-parcela.png', svg: masterPlanSvg() })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  for (const j of jobs) {
    await page.setContent(`<html><body style="margin:0">${j.svg}</body></html>`)
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } })
    writeFileSync(join(OUT, j.file.replace(/^planos\//, '')), png)
    console.log('✓', j.file, `${png.byteLength} bytes`, DEMO_DISCLAIMER ? '' : '')
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

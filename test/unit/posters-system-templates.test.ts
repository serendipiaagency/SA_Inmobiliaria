import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateStructure } from '../../server/utils/assetExport/types'
import { FORMAT_BY_KEY } from '../../server/utils/assetExport/formats'
import { POSTER_FORMAT_KEYS } from '../../server/utils/posters/service'

/**
 * «Carteles de escaparate» (Cola 20·4): las plantillas de SISTEMA sembradas por
 * la migración de datos 0102. Esta prueba lee el propio archivo de migración y
 * valida cada estructura con el MISMO validador que usa el servidor, para que
 * una plantilla de muestra rota no llegue nunca a producción. Comprueba además
 * que sólo usan bloques que el renderizador pdf-lib dibuja hoy (text/image/qr;
 * nada de 'shape', que es Cola 20·3c), que caben en el lienzo de su formato y
 * que llevan los datos esenciales (foto, título, precio).
 */

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '../../migrations/0102_carteles_plantillas_sistema.sql')

interface Seeded {
  name: string
  category: string
  formatKey: string
  structureJson: string
}

function parseSeededTemplates(sql: string): Seeded[] {
  // Las columnas insertadas: NULL, name, description, category, format_key, 1,
  // 'published', structure_json, created_at, updated_at. Ni los nombres ni las
  // descripciones ni el JSON contienen comillas simples (lo garantiza el
  // generador), así que el límite `}', '2026` es único por fila.
  const re = /SELECT NULL, '([^']+)', '[^']*', '([^']+)', '([^']+)', 1, 'published', '(\{"pages":.*?\})', '2026/gs
  const out: Seeded[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) out.push({ name: m[1], category: m[2], formatKey: m[3], structureJson: m[4] })
  return out
}

const templates = parseSeededTemplates(readFileSync(MIGRATION, 'utf8'))

describe('plantillas de cartel de sistema (migración 0102)', () => {
  it('siembra entre 4 y 6 plantillas de muestra', () => {
    expect(templates.length).toBeGreaterThanOrEqual(4)
    expect(templates.length).toBeLessThanOrEqual(6)
  })

  it('cada plantilla es de un formato de cartel conocido y variado', () => {
    for (const t of templates) {
      expect(POSTER_FORMAT_KEYS as readonly string[]).toContain(t.formatKey)
      expect(FORMAT_BY_KEY[t.formatKey]).toBeTruthy()
    }
    // Variedad: al menos un vertical, un horizontal y un A4.
    const keys = templates.map((t) => t.formatKey)
    expect(keys.some((k) => k === 'print_a3_portrait')).toBe(true)
    expect(keys.some((k) => k.endsWith('_landscape'))).toBe(true)
    expect(keys.some((k) => k.startsWith('pdf_a4'))).toBe(true)
  })

  it('cada estructura es válida para el servidor y sólo usa bloques renderizables', () => {
    for (const t of templates) {
      const parsed = JSON.parse(t.structureJson)
      const res = validateStructure(parsed)
      expect(res.ok, `estructura inválida en «${t.name}»`).toBe(true)
      if (!res.ok) continue
      const { W, H } = { W: FORMAT_BY_KEY[t.formatKey]!.widthPt, H: FORMAT_BY_KEY[t.formatKey]!.heightPt }
      for (const page of res.structure.pages) {
        for (const el of page.elements) {
          // El renderizador pdf-lib sólo dibuja text/image/qr (shape → Cola 20·3c).
          expect(['text', 'image', 'qr'], `bloque no renderizable en «${t.name}»`).toContain(el.type)
          // Dentro del lienzo (con un margen de tolerancia de 1pt por redondeo).
          expect(el.x).toBeGreaterThanOrEqual(0)
          expect(el.y).toBeGreaterThanOrEqual(0)
          expect(el.x + el.w).toBeLessThanOrEqual(W + 1)
          expect(el.y + el.h).toBeLessThanOrEqual(H + 1)
        }
      }
    }
  })

  it('cada plantilla lleva la foto principal, el título y el precio de la propiedad', () => {
    for (const t of templates) {
      const bindings = JSON.parse(t.structureJson).pages.flatMap((p: any) => p.elements.map((e: any) => e.binding))
      expect(bindings, `«${t.name}» sin foto`).toContain('{{asset.mainImage}}')
      expect(bindings, `«${t.name}» sin título`).toContain('{{asset.title}}')
      expect(bindings, `«${t.name}» sin precio`).toContain('{{asset.price}}')
    }
  })
})

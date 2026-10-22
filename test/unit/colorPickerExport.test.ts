import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rgb } from 'pdf-lib'
import { hexToRgb } from '../../server/utils/assetExport/pdfRenderer'

/**
 * Selector de color libre del editor visual (reforma de editores): el usuario
 * puede elegir un HEX cualquiera (p. ej. #0B3854) o un color del Brand Kit, y
 * ese color debe CONSERVARSE en el PDF exportado. El renderer ya convierte HEX
 * a color pdf-lib (hexToRgb) y resolveColor acepta tanto roles de marca como
 * HEX; aquí se fija ese contrato y que el editor usa el nuevo selector.
 */
describe('hexToRgb: el color personalizado se conserva en la exportación', () => {
  it('convierte un HEX arbitrario a color pdf-lib', () => {
    const c = hexToRgb('#0B3854', rgb(0, 0, 0))
    expect(c.red).toBeCloseTo(0x0b / 255, 5)
    expect(c.green).toBeCloseTo(0x38 / 255, 5)
    expect(c.blue).toBeCloseTo(0x54 / 255, 5)
  })

  it('acepta HEX con y sin almohadilla; usa el fallback si es inválido', () => {
    expect(hexToRgb('ffffff', rgb(0, 0, 0)).red).toBe(1)
    const fb = rgb(0.5, 0.5, 0.5)
    expect(hexToRgb('no-es-hex', fb)).toBe(fb)
    expect(hexToRgb(undefined, fb)).toBe(fb)
  })
})

describe('el editor usa el selector de color nuevo (no el desplegable limitado)', () => {
  const ROOT = join(import.meta.dirname, '../..')
  const editor = readFileSync(join(ROOT, 'components/admin/AssetExportCanvasEditor.vue'), 'utf8')
  const picker = readFileSync(join(ROOT, 'components/admin/assetExport/ColorPicker.vue'), 'utf8')

  it('el inspector monta AdminAssetExportColorPicker y ya no ofrece sólo «Gris atenuado»', () => {
    expect(editor).toContain('<AdminAssetExportColorPicker')
    expect(editor).toContain('@update:model-value="setColor"')
    expect(editor).not.toContain('<option value="muted">Gris atenuado</option>')
  })

  it('el selector ofrece Brand Kit, predefinidos y HEX libre', () => {
    expect(picker).toContain('Colores de marca')
    expect(picker).toContain('Predefinidos')
    expect(picker).toContain("type=\"color\"")
    expect(picker).toContain('#0B3854') // placeholder HEX de ejemplo
  })
})

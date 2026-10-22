import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Lienzo con datos reales (reforma de editores, Parte II): el editor puede
 * mostrar el documento con los datos REALES de una propiedad (los mismos que
 * resuelve la exportación), en vez de nombres de campo o {{tokens}}. Se
 * comprueba el endpoint de previsualización y que el editor lo consume para
 * pintar textos, imágenes y colores reales, con propiedad elegible.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('endpoint de previsualización de datos', () => {
  const src = read('server/api/admin/asset-export/preview-bindings.get.ts')

  it('reutiliza resolveAssetBindings (mismo resolver que la exportación) y exige assetKind/assetId', () => {
    expect(src).toContain('resolveAssetBindings')
    expect(src).toContain('requireOrgScope')
    expect(src).toContain("'developer_property'")
    expect(src).toContain("'agent_property'")
  })

  it('normaliza las imágenes a una URL cargable por el navegador', () => {
    // clave R2 → /api/media/<clave>; http(s) y /api/media se dejan igual.
    expect(src).toContain('/api/media/')
    expect(src).toMatch(/https\?:\\\/\\\//)
  })
})

describe('el editor pinta datos reales', () => {
  const editor = read('components/admin/AssetExportCanvasEditor.vue')

  it('consume el endpoint de previsualización y acepta una propiedad vinculada', () => {
    expect(editor).toContain('/api/admin/asset-export/preview-bindings')
    expect(editor).toContain('previewProperty')
  })

  it('tiene selector de propiedad de ejemplo y pinta valor/imagen reales', () => {
    expect(editor).toContain('AdminCommsPropertyPickerModal')
    expect(editor).toContain('textContent(el)')
    expect(editor).toContain('imgUrl(el)')
    // El texto se pinta con su estilo real (tamaño/peso/color), no sólo como etiqueta.
    expect(editor).toContain('textCss(el)')
  })

  it('espacio de trabajo: pantalla completa, zoom y paneles contraíbles', () => {
    expect(editor).toContain('fullscreen')
    expect(editor).toContain('zoomFit')
    expect(editor).toContain('zoom100')
    expect(editor).toContain('zoomBy')
    expect(editor).toContain('showPalette')
    expect(editor).toContain('showInspector')
  })
})

describe('las dos piezas pasan su propiedad vinculada al editor', () => {
  it('carteles y piezas generadas pasan preview-property', () => {
    expect(read('pages/admin/carteles/piezas.vue')).toContain(':preview-property=')
    expect(read('pages/admin/asset-export/projects/index.vue')).toContain(':preview-property=')
  })
})

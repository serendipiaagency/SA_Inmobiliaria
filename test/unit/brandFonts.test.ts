import { describe, expect, it } from 'vitest'
import { embedBrandFont } from '../../server/utils/assetExport/brandFonts'

/**
 * Fuentes de marca en el PDF (Cola 22·5b): el guard rechaza una familia que no
 * esté en el catálogo del Constructor ANTES de tocar la red o el documento, de
 * modo que un valor inválido no provoca descargas ni errores (→ Helvetica).
 * El camino de descarga real (familia conocida) depende de red y se cubre con
 * el e2e de carteles, no aquí.
 */
describe('embedBrandFont · guard de familia', () => {
  it('devuelve null sin tocar la red ni el documento para familias no válidas', async () => {
    const fakeDoc = {} as any // no se usa: el guard sale antes
    expect(await embedBrandFont(fakeDoc, null, 400)).toBeNull()
    expect(await embedBrandFont(fakeDoc, '', 400)).toBeNull()
    expect(await embedBrandFont(fakeDoc, 'Comic Sans MS', 400)).toBeNull() // fuera del catálogo
    expect(await embedBrandFont(fakeDoc, 'Wingdings', 700)).toBeNull()
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_TOKENS, TOKEN_GROUPS, isBindingToken, tokenGroupsForKind, tokenLabel } from '../../utils/assetExport/tokenCatalog'

/**
 * Catálogo de campos vinculables del editor visual (reforma de editores): el
 * usuario ve nombres legibles («Título», «Precio»), nunca `{{asset.title}}`,
 * pero el token técnico se conserva internamente. Se comprueba el catálogo y
 * que el editor de lienzo lo usa (sin listas de tokens quemadas ni etiquetas
 * técnicas en la interfaz).
 */
describe('tokenCatalog', () => {
  it('cada token tiene etiqueta legible y tipo; grupos no vacíos', () => {
    expect(TOKEN_GROUPS.length).toBeGreaterThanOrEqual(3)
    for (const g of TOKEN_GROUPS) {
      expect(g.group).toBeTruthy()
      expect(g.items.length).toBeGreaterThan(0)
      for (const it of g.items) {
        expect(it.token).toMatch(/^(asset|tenant)\.[a-zA-Z]+$/)
        expect(it.label).toBeTruthy()
        expect(it.label).not.toMatch(/[{}]/) // la etiqueta nunca lleva llaves
        expect(['text', 'image', 'qr']).toContain(it.kind)
      }
    }
  })

  it('tokenLabel traduce tokens y vinculaciones, y respeta el texto fijo', () => {
    expect(tokenLabel('asset.title')).toBe('Título')
    expect(tokenLabel('{{asset.price}}')).toBe('Precio')
    expect(tokenLabel('{{ asset.location }}')).toBe('Localización')
    expect(tokenLabel('Texto a mano')).toBe('Texto a mano') // no es token → tal cual
    expect(tokenLabel('')).toBe('')
  })

  it('isBindingToken distingue vinculación dinámica de texto fijo', () => {
    expect(isBindingToken('{{asset.title}}')).toBe(true)
    expect(isBindingToken('{{asset.noExiste}}')).toBe(false)
    expect(isBindingToken('Chalet con jardín')).toBe(false)
    expect(isBindingToken('')).toBe(false)
  })

  it('tokenGroupsForKind filtra por tipo de elemento', () => {
    const img = tokenGroupsForKind('image').flatMap((g) => g.items)
    expect(img.every((i) => i.kind === 'image')).toBe(true)
    expect(img.map((i) => i.token)).toContain('asset.mainImage')
    expect(img.map((i) => i.token)).toContain('tenant.logo')

    const qr = tokenGroupsForKind('qr').flatMap((g) => g.items)
    expect(qr.map((i) => i.token)).toEqual(['asset.qrCode'])

    const text = tokenGroupsForKind('text').flatMap((g) => g.items)
    expect(text.every((i) => i.kind === 'text')).toBe(true)
    expect(text.map((i) => i.token)).toContain('asset.title')
    expect(text.map((i) => i.token)).not.toContain('asset.mainImage') // imágenes fuera de texto
  })

  it('el buscador encuentra por etiqueta y por token', () => {
    expect(tokenGroupsForKind('text', 'precio').flatMap((g) => g.items).map((i) => i.token)).toContain('asset.price')
    expect(tokenGroupsForKind('text', 'legal').flatMap((g) => g.items).map((i) => i.token)).toContain('tenant.legalText')
    expect(tokenGroupsForKind('text', 'asset.city').flatMap((g) => g.items).map((i) => i.token)).toContain('asset.city')
    expect(tokenGroupsForKind('text', 'zzzznomatch').flatMap((g) => g.items)).toHaveLength(0)
  })

  it('todos los tokens son únicos', () => {
    const tokens = ALL_TOKENS.map((t) => t.token)
    expect(new Set(tokens).size).toBe(tokens.length)
  })
})

describe('el editor de lienzo usa el catálogo (no etiquetas técnicas)', () => {
  const ROOT = join(import.meta.dirname, '../..')
  const editor = readFileSync(join(ROOT, 'components/admin/AssetExportCanvasEditor.vue'), 'utf8')

  it('importa el catálogo y no mantiene listas de tokens quemadas', () => {
    expect(editor).toContain("from '~/utils/assetExport/tokenCatalog'")
    expect(editor).not.toContain('const ASSET_TOKENS')
    expect(editor).not.toContain('const IMAGE_TOKENS')
    expect(editor).not.toContain('const TENANT_TOKENS')
  })

  it('el desplegable de vinculación muestra la etiqueta legible (it.label), no el token', () => {
    // La opción del <select> enlaza el token como value pero muestra it.label.
    expect(editor).toContain(':value="`{{${it.token}}}`">{{ it.label }}')
    // El contenido del bloque en el lienzo pasa por canvasLabel, no por el binding crudo.
    expect(editor).toContain('canvasLabel(el)')
  })
})

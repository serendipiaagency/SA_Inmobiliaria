import { describe, expect, it } from 'vitest'
import { HERO_TYPE_CATEGORIES, PROPERTY_TYPES } from '../../utils/propertySheet'
import { messages } from '../../i18n/messages'

/**
 * El selector «Tipo de inmueble» del Hero enseña SÓLO seis categorías grandes
 * (Cola 13). Es una taxonomía reducida de presentación: cada tipo real de
 * Property Core cae en una (y sólo una) categoría —así nada queda inalcanzable
 * desde el Hero— y las seis tienen su rótulo en los seis idiomas.
 */
describe('categorías del Hero (Cola 13)', () => {
  it('son exactamente seis, con las claves esperadas en orden', () => {
    expect(HERO_TYPE_CATEGORIES.map((c) => c.key)).toEqual(['homes', 'retail', 'office', 'garage', 'land', 'warehouse'])
  })

  it('cada tipo del catálogo está en una categoría y sólo en una; ninguna inventa tipos', () => {
    const seen = new Map<string, number>()
    for (const c of HERO_TYPE_CATEGORIES) for (const ty of c.types) seen.set(ty, (seen.get(ty) ?? 0) + 1)
    expect([...seen.keys()].sort()).toEqual([...PROPERTY_TYPES].sort())
    expect([...seen.values()].every((n) => n === 1)).toBe(true)
  })

  it('«Edificio» y «Promoción» viven dentro de «Viviendas»', () => {
    const homes = HERO_TYPE_CATEGORIES.find((c) => c.key === 'homes')!
    expect(homes.types).toContain('Building')
    expect(homes.types).toContain('Development')
  })

  it('los rótulos de las seis categorías existen en los seis idiomas', () => {
    const keys = HERO_TYPE_CATEGORIES.map((c) => c.label[0])
    for (const locale of ['es', 'en', 'de', 'pt', 'fr', 'ar']) for (const k of keys) expect(messages[locale]![k], `${locale} ${k}`).toBeTruthy()
    expect(messages.es!['heroTypes.homes']).toBe('Viviendas')
    expect(messages.es!['heroTypes.warehouse']).toBe('Naves')
  })
})

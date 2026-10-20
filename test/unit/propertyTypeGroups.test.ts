import { describe, expect, it } from 'vitest'
import { PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_TYPE_GROUPS, PROPERTY_TYPE_LABELS } from '../../utils/propertySheet'
import { PROPERTY_TYPE_TREE, subtypeParent } from '../../utils/searchState'
import { heroTypeSummary } from '../../utils/heroSearch'
import { messages } from '../../i18n/messages'

/**
 * El selector «Tipo de inmueble» del buscador público enseña el catálogo
 * ENTERO de Property Core, agrupado: cada tipo está en un grupo y sólo en uno,
 * los grupos tienen su rótulo en los seis idiomas y el resumen del campo
 * nombra un grupo entero por su nombre.
 */
describe('grupos canónicos del catálogo de tipos', () => {
  it('cada tipo del catálogo está en un grupo y sólo en uno; ningún grupo inventa tipos', () => {
    const seen = new Map<string, number>()
    for (const g of PROPERTY_TYPE_GROUPS) for (const f of g.families) for (const ty of f.types) seen.set(ty, (seen.get(ty) ?? 0) + 1)
    expect([...seen.keys()].sort()).toEqual([...PROPERTY_TYPES].sort())
    expect([...seen.values()].every((n) => n === 1)).toBe(true)
  })

  it('el árbol del buscador sale de los grupos (no es otra taxonomía)', () => {
    expect(PROPERTY_TYPE_TREE.map((c) => c.key)).toEqual(PROPERTY_TYPE_GROUPS.map((g) => g.key))
    expect(PROPERTY_TYPE_TREE.flatMap((c) => c.families.flatMap((f) => f.types))).toEqual(PROPERTY_TYPE_GROUPS.flatMap((g) => g.families.flatMap((f) => f.types)))
  })

  it('los rótulos de grupos y familias existen en los seis idiomas', () => {
    const keys = new Set(PROPERTY_TYPE_GROUPS.flatMap((g) => [g.label[0], ...g.families.map((f) => f.label[0])]))
    for (const locale of ['es', 'en', 'de', 'pt', 'fr', 'ar']) for (const k of keys) expect(messages[locale]![k], `${locale} ${k}`).toBeTruthy()
    expect(messages.es!['types.commercial']).toBe('Inmuebles comerciales')
  })

  it('cada subtipo pertenece a un tipo del catálogo', () => {
    for (const [type, subs] of Object.entries(PROPERTY_SUBTYPES)) {
      expect(PROPERTY_TYPES as readonly string[]).toContain(type)
      for (const s of Object.keys(subs)) expect(subtypeParent(s)).toBe(type)
    }
  })

  it('el resumen del Hero nombra una categoría grande por su nombre (Cola 13)', () => {
    const t = (k: string, fb: string) => messages.es![k] ?? fb
    const all = [...PROPERTY_TYPES]
    const sum = (types: string[]) => heroTypeSummary(types, [], all, t, (ty) => PROPERTY_TYPE_LABELS[ty]!, (s) => s)
    // «Viviendas» es la categoría del Hero: incluye también Edificio y Promoción.
    expect(sum(['Apartment', 'House', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Studio', 'Finca', 'Building', 'Development'])).toBe('Viviendas')
    expect(sum(['Retail'])).toBe('Locales')
    expect(sum(['Office'])).toBe('Oficinas')
    expect(sum(['Garage'])).toBe('Garaje')
    expect(sum(['Land'])).toBe('Terreno')
    expect(sum(['Warehouse'])).toBe('Naves')
    expect(sum(['Retail', 'Office'])).toBe('Locales y oficinas')
    // Parte de «Viviendas» (llegando por URL) se nombra por tipos sueltos, no como «Viviendas».
    expect(sum(['Apartment'])).toBe('Piso')
  })
})

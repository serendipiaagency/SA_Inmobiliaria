import { describe, expect, it } from 'vitest'
import { LOCALES, messages } from '../../i18n/messages'
import { PROPERTY_SUBTYPES } from '../../utils/propertySheet'
import {
  ESTADO_LABELS,
  FEATURE_GROUPS,
  FEATURE_LABELS,
  LOCATION_GROUP_LABELS,
  LOCATION_KIND_LABELS,
  MORE_SORTS,
  PROPERTY_TYPE_TREE,
  RENTAL_TERM_LABELS,
  SITUATION_LABELS,
  SORT_LABELS,
  QUICK_SORTS,
  SORT_KEYS,
  bedroomsApply,
  listParam,
  mergeModalFilters,
  modalSeedFrom,
  normalizeText,
  operationSwitchPatch,
  orderedRange,
  parseAmount,
  parseEstado,
  parseFeatures,
  parseLocations,
  parseOperation,
  parseSort,
  parseTypes,
  priceSteps,
} from '../../utils/searchState'

/** El estado único de búsqueda de la web pública: lo leen igual el navegador y el servidor. */

describe('estado de búsqueda: lectura de la URL', () => {
  it('exactamente ocho ordenaciones: tres rápidas y cinco en «Más», sin pisos altos ni bajos', () => {
    expect(SORT_KEYS).toHaveLength(8)
    expect([...QUICK_SORTS, ...MORE_SORTS].sort()).toEqual([...SORT_KEYS].sort())
    expect(SORT_KEYS.join(' ')).not.toMatch(/floor/i)
    expect(parseSort('price_drop')).toBe('price_drop')
    expect(parseSort('floor_high')).toBe('')
    expect(parseSort(['newest', 'oldest'])).toBe('newest')
  })

  it('operación: sólo venta o alquiler', () => {
    expect(parseOperation('alquiler')).toBe('alquiler')
    expect(parseOperation('traspaso')).toBeNull()
    expect(parseOperation(undefined)).toBeNull()
  })

  it('parámetros repetidos o con comas, sin duplicados y con tope', () => {
    expect(listParam(['a', 'b,c', 'a'])).toEqual(['a', 'b', 'c'])
    expect(listParam('')).toEqual([])
    expect(listParam(Array.from({ length: 50 }, (_, i) => `x${i}`), 5)).toHaveLength(5)
  })

  it('ubicaciones: tipo y nombre reales, sin repetir (sin tildes ni mayúsculas), con tope', () => {
    expect(parseLocations({ municipality: ['Oviedo', 'OVIEDO', 'Gijón'], postalCode: ' 33 001 ' })).toEqual([
      { kind: 'municipality', value: 'Oviedo' },
      { kind: 'municipality', value: 'Gijón' },
      { kind: 'postalCode', value: '33001' },
    ])
    expect(parseLocations({ neighborhood: Array.from({ length: 30 }, (_, i) => `Z${i}`) })).toHaveLength(12)
    expect(normalizeText('  Ovíedo  Centro ')).toBe('oviedo centro')
  })

  it('tipos y subtipos: sólo los de Property Core', () => {
    expect(parseTypes({ type: ['Apartment', 'Castle'], subtype: ['penthouse', 'nope'] })).toEqual({ types: ['Apartment'], subtypes: ['penthouse'] })
  })

  it('habitaciones y baños sólo cuando el tipo los tiene', () => {
    expect(bedroomsApply([])).toBe(true)
    expect(bedroomsApply(['Retail', 'Garage'])).toBe(false)
    expect(bedroomsApply(['Retail', 'Apartment'])).toBe(true)
    expect(bedroomsApply([], ['urban'])).toBe(false)
    expect(bedroomsApply([], ['penthouse'])).toBe(true)
  })

  it('estado (y el `obra` de enlaces anteriores) y características', () => {
    expect(parseEstado({ estado: ['reformado', 'x'], obra: 'nueva' })).toEqual(['obra_nueva', 'reformado'])
    expect(parseFeatures({ terrace: '1', pool: '0', furnished: 'yes', balcony: '1' })).toEqual(['terrace', 'balcony', 'furnished'])
  })

  it('importes: positivos, redondeados, con tope; rango ordenado', () => {
    expect(parseAmount('150000.4')).toBe(150000)
    expect(parseAmount('-3')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1e20')).toBe(1e10)
    expect(orderedRange(500, 100)).toEqual([100, 500])
    expect(orderedRange(null, 100)).toEqual([null, 100])
  })

  it('escalas de precio distintas para comprar y alquilar', () => {
    expect(priceSteps('venta').at(-1)).toBeGreaterThan(1_000_000)
    expect(priceSteps('alquiler').at(-1)).toBeLessThan(20_000)
    expect(priceSteps('alquiler')).not.toEqual(priceSteps('venta'))
  })
})

describe('estado de búsqueda: cambios', () => {
  it('cambiar de operación quita sólo lo incompatible', () => {
    expect(operationSwitchPatch('venta')).toEqual({ operacion: 'venta', minPrice: undefined, maxPrice: undefined, page: undefined, rentalTerm: undefined, expensesIncluded: undefined })
    expect(operationSwitchPatch('alquiler')).toEqual({ operacion: 'alquiler', minPrice: undefined, maxPrice: undefined, page: undefined, minYield: undefined })
  })

  it('el modal sólo sustituye sus propios filtros y respeta los de varios valores que no puede enseñar', () => {
    const current = { operacion: 'alquiler', sort: 'newest', estado: 'reformado', municipality: ['Oviedo', 'Gijón'], bedrooms: '2', terrace: '1', page: '3' }
    expect(mergeModalFilters(current, { bedrooms: '3' })).toEqual({ operacion: 'alquiler', sort: 'newest', estado: 'reformado', municipality: ['Oviedo', 'Gijón'], bedrooms: '3' })
    // Si el modal sí trae municipio, manda el del modal.
    expect(mergeModalFilters(current, { municipality: 'Avilés' })).toMatchObject({ municipality: 'Avilés' })
    expect(modalSeedFrom(current)).toEqual({ bedrooms: 2, terrace: true })
  })
})

describe('estado de búsqueda: textos', () => {
  // Estas claves se piden con una variable (`t(SORT_LABELS[k][0], …)`), así que
  // la prueba general de traducciones no las ve: se comprueban aquí.
  const labels: [string, string][] = [
    ...Object.values(SORT_LABELS),
    ...Object.values(LOCATION_KIND_LABELS),
    ...Object.values(LOCATION_GROUP_LABELS),
    ...Object.values(ESTADO_LABELS),
    ...Object.values(SITUATION_LABELS),
    ...Object.values(RENTAL_TERM_LABELS),
    ...Object.values(FEATURE_LABELS),
    ...FEATURE_GROUPS.map((g) => g.label),
    ...PROPERTY_TYPE_TREE.flatMap((c) => [c.label, ...c.families.map((f) => f.label)]).filter(([k]) => k),
    ...Object.values(PROPERTY_SUBTYPES).flatMap((subs) => Object.entries(subs).map(([k, es]): [string, string] => [`filters.subtype.${k}`, es])),
  ]

  it('en castellano el diccionario dice lo mismo que el respaldo del código', () => {
    for (const [key, es] of labels) expect(messages.es[key], key).toBe(es)
  })

  for (const { code } of LOCALES.filter((l) => l.code !== 'es')) {
    it(`todas traducidas en «${code}»`, () => {
      expect(labels.filter(([key]) => !messages[code]?.[key]).map(([key]) => key)).toEqual([])
    })
  }
})

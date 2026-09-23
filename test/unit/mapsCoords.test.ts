import { describe, expect, it } from 'vitest'
import { isFiniteCoord, hasValidCoords, withValidCoords } from '../../utils/maps/coords'
import { pickDynamicItems } from '../../utils/siteBuilder/pickItems'

describe('isFiniteCoord', () => {
  it('accepts real numbers, including 0 and negatives', () => {
    expect(isFiniteCoord(0)).toBe(true)
    expect(isFiniteCoord(-3.7038)).toBe(true)
    expect(isFiniteCoord(40.4168)).toBe(true)
  })

  it('rejects the shapes real map bugs actually produced: strings, null, NaN, Infinity', () => {
    // La causa raíz nº3 de la auditoría de mapas: coordenadas guardadas como
    // string ("40.4168") pasan un `if (lat && lng)` pero rompen L.marker().
    expect(isFiniteCoord('40.4168')).toBe(false)
    expect(isFiniteCoord(null)).toBe(false)
    expect(isFiniteCoord(undefined)).toBe(false)
    expect(isFiniteCoord(NaN)).toBe(false)
    expect(isFiniteCoord(Infinity)).toBe(false)
  })
})

describe('hasValidCoords', () => {
  it('accepts a real pair, including one that legitimately sits on the equator or the prime meridian', () => {
    expect(hasValidCoords({ lat: 40.4168, lng: -3.7038 })).toBe(true)
    expect(hasValidCoords({ lat: 0, lng: 55.25 })).toBe(true)
    expect(hasValidCoords({ lat: 25.15, lng: 0 })).toBe(true)
  })

  it('rejects the exact (0,0) pair — the placeholder/unset sentinel, not a real location', () => {
    expect(hasValidCoords({ lat: 0, lng: 0 })).toBe(false)
  })

  it('rejects missing or non-numeric coordinates', () => {
    expect(hasValidCoords({})).toBe(false)
    expect(hasValidCoords({ lat: 40.4168 })).toBe(false)
    expect(hasValidCoords({ lat: '40.4168', lng: '-3.7038' })).toBe(false)
  })
})

describe('withValidCoords', () => {
  it('keeps only the items with a real location, preserving the rest of each item', () => {
    const items = [
      { id: 1, name: 'Con ubicación', lat: 40.4168, lng: -3.7038 },
      { id: 2, name: 'Sin ubicación (0,0)', lat: 0, lng: 0 },
      { id: 3, name: 'Sin coordenadas', lat: null, lng: null },
    ]
    const result = withValidCoords(items)
    expect(result.map((i) => i.id)).toEqual([1])
    expect(result[0].name).toBe('Con ubicación')
  })

  it('returns an empty array, never throws, when nothing has a real location', () => {
    expect(withValidCoords([{ id: 1, lat: 0, lng: 0 }])).toEqual([])
    expect(withValidCoords([])).toEqual([])
  })
})

describe('pickDynamicItems (vocabulario compartido con PropertiesBlock, usado por el mapa del Constructor Web)', () => {
  const all = [
    { id: 1, community: 'Marina', propertyType: 'flat', price: 300000, isExclusive: 0, rentalYield: 4 },
    { id: 2, community: 'Marina', propertyType: 'villa', price: 900000, isExclusive: 1, rentalYield: 6 },
    { id: 3, community: 'Centro', propertyType: 'flat', price: 150000, isExclusive: 0, rentalYield: 8 },
  ]

  it('"latest" (por defecto) respeta el orden recibido y el límite', () => {
    expect(pickDynamicItems(all, {}, 2).map((p) => p.id)).toEqual([1, 2])
  })

  it('"featured" sólo trae exclusivas, y cae en todas si no hay ninguna', () => {
    expect(pickDynamicItems(all, { dynamicFilter: 'featured' }, 10).map((p) => p.id)).toEqual([2])
    const noExclusive = all.map((p) => ({ ...p, isExclusive: 0 }))
    expect(pickDynamicItems(noExclusive, { dynamicFilter: 'featured' }, 10)).toHaveLength(3)
  })

  it('"premium"/"affordable" ordenan por precio', () => {
    expect(pickDynamicItems(all, { dynamicFilter: 'premium' }, 1).map((p) => p.id)).toEqual([2])
    expect(pickDynamicItems(all, { dynamicFilter: 'affordable' }, 1).map((p) => p.id)).toEqual([3])
  })

  it('"community"/"type" filtran exactamente por el valor guardado', () => {
    expect(pickDynamicItems(all, { dynamicFilter: 'community', dynamicCommunity: 'Marina' }, 10).map((p) => p.id)).toEqual([1, 2])
    expect(pickDynamicItems(all, { dynamicFilter: 'type', dynamicType: 'villa' }, 10).map((p) => p.id)).toEqual([2])
  })

  it('"manual" respeta el orden elegido, no el del catálogo, e ignora ids inexistentes', () => {
    expect(pickDynamicItems(all, { source: 'manual', manualIds: [3, 1, 999] }, 10).map((p) => p.id)).toEqual([3, 1])
  })

  it('un bloque guardado con la forma antigua (sin source/dynamicFilter) cae en "latest" — no hace falta migrar datos', () => {
    expect(pickDynamicItems(all, { pins: [{ label: 'x', x: 50, y: 50 }] }, 10).map((p) => p.id)).toEqual([1, 2, 3])
  })
})

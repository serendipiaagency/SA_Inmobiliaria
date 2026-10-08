import { describe, expect, it } from 'vitest'
import { catalogChips } from '../../utils/catalogChips'

/** Los chips de filtros activos del catálogo público (#109). */

const t = (_k: string, fallback: string) => fallback
const fmt = (n: number) => `${n.toLocaleString('es-ES')} €`
const typeLabel = (type: string) => ({ Penthouse: 'Ático' })[type] || type

describe('chips del catálogo', () => {
  it('sin filtros, ninguno', () => {
    expect(catalogChips({}, t, fmt, typeLabel)).toEqual([])
    expect(catalogChips({ page: '2', sort: 'price_asc', vista: 'mapa' }, t, fmt, typeLabel)).toEqual([])
  })

  it('los de la referencia: municipio, precio, superficie, habitaciones y terraza, cada uno con lo que borra', () => {
    const chips = catalogChips({ municipality: 'Oviedo', minPrice: '300000', maxPrice: '600000', minArea: '100', bedrooms: '3', terrace: '1' }, t, fmt, typeLabel)
    expect(chips.map((c) => c.label)).toEqual(['Oviedo', '300.000 € - 600.000 €', '> 100 m²', '3+ habitaciones', 'Terraza'])
    expect(chips.find((c) => c.key === 'price')!.clear).toEqual(['minPrice', 'maxPrice'])
  })

  it('rangos abiertos, tipo y estado con su texto, radio y zona del mapa', () => {
    const chips = catalogChips(
      { maxPrice: '250000', maxArea: '90', type: 'Penthouse', status: 'under_construction', lat: '43.36', lng: '-5.85', radiusKm: '2', north: '1', south: '0', east: '1', west: '0', operacion: 'venta', q: 'ático' },
      t,
      fmt,
      typeLabel,
    )
    const byKey = Object.fromEntries(chips.map((c) => [c.key, c]))
    expect(byKey.price.label).toBe('< 250.000 €')
    expect(byKey.area.label).toBe('< 90 m²')
    expect(byKey.type.label).toBe('Ático')
    expect(byKey.status.label).toBe('En construcción')
    expect(byKey.nearby).toMatchObject({ label: 'Radio 2 km', clear: ['lat', 'lng', 'radiusKm'] })
    expect(byKey['area-map'].clear).toEqual(['north', 'south', 'east', 'west'])
    expect(byKey.operacion.label).toBe('En venta')
    expect(byKey.q.label).toBe('«ático»')
  })

  it('valores vacíos, a 0 o basura no hacen chip', () => {
    expect(catalogChips({ minPrice: '0', bedrooms: 'x', terrace: '0', municipality: '' }, t, fmt, typeLabel)).toEqual([])
  })
})

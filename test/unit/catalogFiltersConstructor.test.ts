import { describe, expect, it } from 'vitest'
import { CATALOG_FILTER_GROUPS, catalogDisplayOptions, catalogFilterKeys, catalogFilterOpenKeys, normalizeCatalogFilters, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'

describe('filtros del catálogo en el Constructor', () => {
  it('sin configuración, todos los grupos visibles y en el orden de la referencia', () => {
    expect(normalizeCatalogFilters(undefined).map((x) => x.key)).toEqual(['location', 'price', 'area', 'bedrooms', 'bathrooms', 'type', 'status', 'situation', 'rental', 'features'])
    expect(normalizeCatalogFilters(null).every((x) => x.visible)).toBe(true)
    expect(catalogFilterKeys(undefined)).toEqual(CATALOG_FILTER_GROUPS.map((x) => x.key))
  })

  it('respeta el orden guardado, descarta lo desconocido y lo repetido y completa lo que falte al final', () => {
    const list = normalizeCatalogFilters([{ key: 'features' }, { key: 'datos' }, { key: 'price', visible: false }, { key: 'features', visible: false }, 7])
    expect(list.slice(0, 2)).toEqual([{ key: 'features', visible: true }, { key: 'price', visible: false }])
    expect(list).toHaveLength(CATALOG_FILTER_GROUPS.length)
    expect(list.slice(2).every((x) => x.visible)).toBe(true)
  })

  it('las claves visibles, en su orden, para pintar el panel', () => {
    expect(catalogFilterKeys([{ key: 'bedrooms' }, { key: 'location', visible: false }, { key: 'area', visible: false }])).toEqual(['bedrooms', 'price', 'bathrooms', 'type', 'status', 'situation', 'rental', 'features'])
    // Todo oculto: el panel se queda sin grupos, pero con «Más filtros» y el botón de resultados.
    expect(catalogFilterKeys(CATALOG_FILTER_GROUPS.map((x) => ({ key: x.key, visible: false })))).toEqual([])
  })

  it('grupos abiertos al cargar: los marcados; sin ninguno, Ubicación (o el primero visible)', () => {
    expect(catalogFilterOpenKeys(undefined)).toEqual(['location'])
    expect(catalogFilterOpenKeys([{ key: 'price', open: true }, { key: 'type', open: true }])).toEqual(['price', 'type'])
    expect(catalogFilterOpenKeys([{ key: 'location', visible: false }])).toEqual(['price'])
    // Uno oculto no se abre aunque esté marcado.
    expect(catalogFilterOpenKeys([{ key: 'price', open: true, visible: false }])).toEqual(['location'])
    expect(normalizeCatalogFilters([{ key: 'price', open: 'sí' }])[0]).toEqual({ key: 'price', visible: true })
  })

  it('opciones del buscador: todo visible y «Comprar» de partida si no se dice otra cosa', () => {
    expect(catalogDisplayOptions(null)).toEqual({ showPanel: true, showOperation: true, showSort: true, showNewSearch: true, defaultOperation: 'venta' })
    expect(catalogDisplayOptions({ showSort: false, defaultOperation: 'alquiler' })).toMatchObject({ showSort: false, defaultOperation: 'alquiler', showPanel: true })
  })

  it('el servidor guarda sólo esas opciones en la zona del catálogo', () => {
    expect(sanitizeCoreOptions('properties-listing', { filters: [{ key: 'type' }], showFeatured: false })).toEqual({ filters: normalizeCatalogFilters([{ key: 'type' }]) })
    expect(sanitizeCoreOptions('properties-listing', { showPanel: false, showSort: 'no', defaultOperation: 'alquiler', showNewSearch: true })).toEqual({ showPanel: false, defaultOperation: 'alquiler', showNewSearch: true })
    expect(sanitizeCoreOptions('properties-listing', { defaultOperation: 'traspaso' })).toEqual({})
    expect(sanitizeCoreOptions('properties-listing', { filters: 'todos' })).toEqual({})
    expect(sanitizeCoreOptions('blog-index', { filters: [{ key: 'type' }] })).toEqual({})
  })
})

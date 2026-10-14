import { describe, expect, it } from 'vitest'
import { SEARCH_FEATURED_MAX, SEARCH_SUGGESTIONS_DEFAULT, normalizeFeaturedLocations, searchLocationOptions, searchMapTools, searchTypeOptions } from '../../utils/searchConfig'
import { heroSearchOptions } from '../../utils/heroSearch'
import { catalogDisplayOptions, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'

/**
 * «Tipo de inmueble» y «Ubicación» configurables en el Constructor (Parte
 * III del buscador global): valores de partida, validación y las mismas
 * claves en el Hero y en el panel de Propiedades. Sólo presentación.
 */
describe('configuración del buscador (utils/searchConfig.ts)', () => {
  it('sin nada guardado: textos de la web, contadores, 14 sugerencias, sin destacadas y las tres herramientas del mapa', () => {
    expect(searchTypeOptions(null)).toEqual({ placeholder: '', showCounts: true })
    expect(searchLocationOptions(undefined)).toEqual({ placeholder: '', maxSuggestions: SEARCH_SUGGESTIONS_DEFAULT, showCounts: true, featured: [], mapSelect: true, mapDraw: true, mapNearby: true })
    expect(searchMapTools(searchLocationOptions(null))).toEqual(['select', 'draw', 'nearby'])
  })

  it('valida lo guardado: textos recortados, sugerencias sólo de la escala, destacadas con id válido y sin repetir', () => {
    const content = {
      typePlaceholder: '  Qué buscas  ',
      typeShowCounts: false,
      locationPlaceholder: 'x'.repeat(80),
      locationSuggestions: '8',
      locationShowCounts: 'no',
      locationFeatured: [{ id: 'es:mun:28079', value: 'Madrid' }, { id: 'es:mun:28079', value: 'Madrid otra vez' }, { id: 'nope', value: 'Nada' }, { id: 'zone:3', value: 'Centro', context: 'Gijón' }, 7],
      locationMapDraw: false,
    }
    expect(searchTypeOptions(content)).toEqual({ placeholder: 'Qué buscas', showCounts: false })
    const loc = searchLocationOptions(content)
    expect(loc.placeholder).toHaveLength(60)
    expect(loc.maxSuggestions).toBe(8)
    expect(loc.showCounts).toBe(true)
    expect(loc.featured).toEqual([{ id: 'es:mun:28079', value: 'Madrid', context: null }, { id: 'zone:3', value: 'Centro', context: 'Gijón' }])
    expect(searchMapTools(loc)).toEqual(['select', 'nearby'])
    expect(searchLocationOptions({ locationSuggestions: 11 }).maxSuggestions).toBe(SEARCH_SUGGESTIONS_DEFAULT)
    expect(normalizeFeaturedLocations(Array.from({ length: 12 }, (_, i) => ({ id: `es:mun:${String(i).padStart(5, '0')}`, value: `M${i}` })))).toHaveLength(SEARCH_FEATURED_MAX)
  })

  it('las mismas claves en el Hero y en el panel de Propiedades', () => {
    const content = { typePlaceholder: 'Qué buscas', locationPlaceholder: 'Dónde', locationSuggestions: 20, locationMapNearby: false, locationFeatured: [{ id: 'es:prov:33', value: 'Asturias' }] }
    const hero = heroSearchOptions(content)
    const panel = catalogDisplayOptions(content)
    expect(hero.type).toEqual(panel.type)
    expect(hero.location).toEqual(panel.location)
    expect(hero.location.featured[0]!.id).toBe('es:prov:33')
    expect(searchMapTools(panel.location)).toEqual(['select', 'draw'])
  })

  it('el servidor guarda esas claves en la zona del catálogo y descarta lo que no vale', () => {
    const saved = sanitizeCoreOptions('properties-listing', {
      typePlaceholder: 'Qué buscas',
      typeShowCounts: false,
      locationSuggestions: '8',
      locationFeatured: [{ id: 'es:mun:28079', value: 'Madrid' }, { id: 'malo' }],
      locationMapDraw: false,
      locationMapSelect: 'sí',
      otraCosa: 1,
    })
    expect(saved).toEqual({ typePlaceholder: 'Qué buscas', typeShowCounts: false, locationSuggestions: 8, locationFeatured: [{ id: 'es:mun:28079', value: 'Madrid', context: null }], locationMapDraw: false })
    expect(sanitizeCoreOptions('properties-listing', { locationFeatured: [{ id: 'malo' }] })).toEqual({})
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HERO_DEFAULT_BUTTON, HERO_MIN_CONTRAST, HERO_SEARCH_FIELDS, countHeroExtraFilters, heroButtonColors, heroSearchOptions, heroTypeSummary, normalizeHeroFields, type HeroExtraFilters } from '../../utils/heroSearch'
import { relativeLuminance } from '../../utils/contactTone'

/**
 * Hero de la portada (megaprompt «Hero»): la barra de cuatro campos, el
 * botón «Buscar» con el color de la marca, el resumen del tipo de inmueble y
 * el contador de «Más filtros». La búsqueda es la de Property Search: aquí
 * sólo se comprueba lo que el Hero calcula para enseñarla.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const t = (_key: string, fallback: string) => fallback
const typeLabel = (ty: string) => ({ Apartment: 'Piso', Penthouse: 'Ático', Duplex: 'Dúplex', Studio: 'Estudio', House: 'Casa', Villa: 'Villa', Townhouse: 'Adosado', Finca: 'Finca', Retail: 'Local', Garage: 'Garaje', Land: 'Terreno' })[ty] || ty
const subLabel = (s: string) => s
const contrast = (hex: string) => 1.05 / (relativeLuminance([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]) + 0.05)

describe('barra del Hero: cuatro campos, en orden, configurables', () => {
  it('de partida: Tipo de inmueble, Ubicación, Precio y Habitaciones; ni baños ni superficie', () => {
    const o = heroSearchOptions({})
    expect(o.fields).toEqual(['type', 'location', 'price', 'beds'])
    expect(HERO_SEARCH_FIELDS.map((f) => f.key)).not.toContain('baths')
    expect(HERO_SEARCH_FIELDS.map((f) => f.key)).not.toContain('area')
    expect(o).toMatchObject({ buttonLabel: '', showMoreFilters: true, defaultOperation: 'venta', buttonColor: '', radius: 'lg' })
  })

  it('el Constructor ordena y oculta campos; lo desconocido o repetido se descarta y lo que falta se añade', () => {
    const list = normalizeHeroFields([{ key: 'price' }, { key: 'beds', visible: false }, { key: 'price' }, { key: 'baths' }, { key: 'type' }])
    expect(list.map((f) => f.key)).toEqual(['price', 'beds', 'type', 'location'])
    expect(heroSearchOptions({ searchFields: list }).fields).toEqual(['price', 'type', 'location'])
  })

  it('texto del botón, «Más filtros», operación de partida, color y radio', () => {
    const o = heroSearchOptions({ searchButtonLabel: '  Encontrar  ', showMoreFilters: false, defaultOperation: 'alquiler', searchButtonColor: '#1F4A3F', searchRadius: 'pill' })
    expect(o).toMatchObject({ buttonLabel: 'Encontrar', showMoreFilters: false, defaultOperation: 'alquiler', buttonColor: '#1f4a3f', radius: 'pill' })
    expect(heroSearchOptions({ searchButtonColor: 'red', searchRadius: 'xl', defaultOperation: 'x' })).toMatchObject({ buttonColor: '', radius: 'lg', defaultOperation: 'venta' })
  })
})

describe('botón «Buscar»: el color de la marca, siempre legible', () => {
  it('sin color propio, el de la marca; sin marca, la tinta de la web', () => {
    expect(heroButtonColors('', '#1f4a3f').bg).toBe('#1f4a3f')
    expect(heroButtonColors('', null).bg).toBe(HERO_DEFAULT_BUTTON)
    expect(heroButtonColors('#7a3f26', '#1f4a3f').bg).toBe('#7a3f26')
  })

  it('un color claro se oscurece (mismo tono) hasta que el texto blanco se lee bien', () => {
    const c = heroButtonColors('#f2d31c', null)
    expect(c.fg).toBe('#ffffff')
    expect(contrast(c.bg)).toBeGreaterThanOrEqual(HERO_MIN_CONTRAST)
    expect(c.bg).not.toBe('#f2d31c')
  })
})

describe('«Tipo de inmueble»: lo elegido, resumido', () => {
  const available = ['Apartment', 'Penthouse', 'Duplex', 'House', 'Villa', 'Retail', 'Garage', 'Land']
  const sum = (types: string[], subtypes: string[] = []) => heroTypeSummary(types, subtypes, available, t, typeLabel, subLabel)

  it('nada elegido: vacío (el campo dice «Cualquiera»)', () => {
    expect(sum([])).toBe('')
  })
  it('todas las viviendas publicadas: «Viviendas»; todos los pisos: «Pisos»', () => {
    expect(sum(['Apartment', 'Penthouse', 'Duplex', 'House', 'Villa'])).toBe('Viviendas')
    expect(sum(['Apartment', 'Penthouse', 'Duplex'])).toBe('Pisos')
  })
  it('dos: «Piso y ático»; tres o más: «3 tipos seleccionados»', () => {
    expect(sum(['Apartment', 'Penthouse'])).toBe('Piso y ático')
    expect(sum(['Apartment', 'Retail', 'Garage'])).toBe('3 tipos seleccionados')
    expect(sum(['Retail'], ['urban'])).toBe('Local y urban')
  })
})

describe('«Más filtros (n)»: sólo lo de dentro, contado de verdad', () => {
  const none: HeroExtraFilters = { baths: 0, minArea: '', maxArea: '', estado: [], features: [], orientation: '', energy: '', minYield: '', rentalTerms: [], situations: [] }

  it('sin nada, cero (no se enseña el número)', () => {
    expect(countHeroExtraFilters(none, 'venta')).toBe(0)
  })
  it('cada opción cuenta una; la superficie, una aunque tenga mínimo y máximo', () => {
    expect(countHeroExtraFilters({ ...none, baths: 2, minArea: 60, maxArea: 120, estado: ['obra_nueva'], features: ['terrace', 'pool'] }, 'venta')).toBe(5)
    expect(countHeroExtraFilters({ ...none, orientation: 'S', energy: 'B', situations: ['rented'] }, 'venta')).toBe(3)
  })
  it('lo de la otra operación no cuenta (inversión al alquilar, modalidad al comprar)', () => {
    const f = { ...none, minYield: 5 as const, rentalTerms: ['seasonal'], features: ['expensesIncluded'] }
    expect(countHeroExtraFilters(f, 'venta')).toBe(1)
    expect(countHeroExtraFilters(f, 'alquiler')).toBe(2)
  })
})

describe('el Hero usa la búsqueda real (sin lógica duplicada)', () => {
  const source = readFileSync(join(ROOT, 'components/HeroSearch.vue'), 'utf8')
  it('baños y superficie no están en la barra, sino en «Más filtros»', () => {
    const bar = source.slice(source.indexOf('data-testid="hero-bar"'), source.indexOf('data-testid="hero-more"'))
    expect(bar).not.toMatch(/hero-cell-baths|hero-cell-area/)
    const panel = source.slice(source.indexOf('data-testid="hero-more-panel"'))
    expect(panel).toMatch(/hero-baths-/)
    expect(panel).toMatch(/hero-area-min/)
  })
  it('«Buscar» no es un botón circular y lleva su texto', () => {
    expect(source).toMatch(/class="hs-search group"/)
    expect(source).toMatch(/hs-search-label/)
    expect(source).not.toMatch(/search-btn/)
  })
  it('los filtros salen de utils/searchState.ts y el tipo, del árbol del catálogo', () => {
    expect(source).toMatch(/from '~\/utils\/searchState'/)
    expect(source).toMatch(/<TypeTreeFilter/)
    expect(source).toMatch(/router\.push\(\{ path: '\/propiedades', query: searchQuery\(\) \}\)/)
  })
})

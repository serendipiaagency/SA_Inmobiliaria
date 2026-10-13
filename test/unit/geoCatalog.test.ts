import { beforeAll, describe, expect, it } from 'vitest'
import { editDistance, geoIndex, geoMunicipalitiesOf, geoPlace, geoSource, loadGeoCatalog, searchGeo, typoBudget } from '../../server/utils/geo/catalog'

/**
 * El catálogo geográfico de España del buscador (GeoNames, CC-BY 4.0):
 * niveles reales, búsqueda tolerante y ranking determinista.
 */
describe('catálogo geográfico de España', () => {
  beforeAll(() => loadGeoCatalog())

  it('tiene todos los niveles, con identificadores canónicos y jerarquía', () => {
    const { places } = geoIndex()
    const count = (k: string) => places.filter((p) => p.kind === k).length
    expect(count('region')).toBe(19)
    expect(count('province')).toBe(52)
    expect(count('municipality')).toBeGreaterThan(8000)
    expect(count('locality')).toBeGreaterThan(20000)
    expect(count('postalCode')).toBeGreaterThan(11000)
    expect(geoSource()).toContain('GeoNames')
    const gijon = geoPlace('es:mun:33024')!
    expect(gijon.name).toBe('Gijón/Xixón')
    expect(gijon.context).toBe('Asturias')
    expect(gijon.provinceId).toBe('es:prov:33')
    expect(gijon.regionId).toBe('es:ccaa:34')
    expect(geoPlace('es:prov:33')!.name).toBe('Asturias')
    expect(geoPlace('es:ccaa:34')!.name).toBe('Principado de Asturias')
    expect(geoMunicipalitiesOf('es:prov:33').length).toBe(78)
    expect(geoMunicipalitiesOf('33').some((m) => m.id === 'es:mun:33044')).toBe(true)
  })

  it('encuentra por prefijo, sin tildes, por variante cooficial y por texto parcial', () => {
    expect(searchGeo('gij')[0]!.place.id).toBe('es:mun:33024')
    expect(searchGeo('malaga')[0]!.place.id).toBe('es:mun:29067')
    expect(searchGeo('Málaga').map((m) => m.place.id)).toContain('es:prov:29')
    expect(searchGeo('ovied')[0]!.place.id).toBe('es:mun:33044')
    expect(searchGeo('xixon')[0]!.place.id).toBe('es:mun:33024')
    const somio = searchGeo('somio')[0]!
    expect(somio.place.kind).toBe('locality')
    expect(somio.place.name).toBe('Somió')
    expect(somio.place.context).toBe('Gijón/Xixón')
    expect(somio.place.municipalityId).toBe('es:mun:33024')
    // Parcial dentro del nombre.
    expect(searchGeo('de siero').some((m) => m.place.name === 'Pola de Siero')).toBe(true)
  })

  it('tolera errores tipográficos razonables, nunca en palabras cortas', () => {
    expect(editDistance('oviedo', 'oviedp', 2)).toBe(1)
    expect(editDistance('oviedo', 'oveido', 2)).toBe(1) // transposición de adyacentes
    expect(editDistance('abc', 'xyz', 1)).toBe(2) // acotada: max + 1
    expect(typoBudget('gij')).toBe(0)
    expect(typoBudget('oviedp')).toBe(1)
    expect(typoBudget('barcelonna')).toBe(2)
    expect(searchGeo('oviedp')[0]!.place.id).toBe('es:mun:33044')
    expect(searchGeo('barcelonna')[0]!.place.id).toBe('es:mun:08019')
    expect(searchGeo('gix').some((m) => m.place.id === 'es:mun:33024')).toBe(false)
  })

  it('códigos postales sólo con cifras, con su municipio', () => {
    const cp = searchGeo('33201')[0]!
    expect(cp.place.kind).toBe('postalCode')
    expect(cp.place.municipalityId).toBe('es:mun:33024')
    expect(cp.place.context).toContain('Gijón')
    expect(searchGeo('332').every((m) => m.place.kind === 'postalCode' && m.place.name.startsWith('332'))).toBe(true)
    expect(searchGeo('gijon').some((m) => m.place.kind === 'postalCode')).toBe(false)
  })

  it('ranking determinista: exacta antes que prefijo, municipio antes que provincia a igualdad, y el contexto sólo reordena', () => {
    const a = searchGeo('madrid').map((m) => m.place.id)
    expect(a[0]).toBe('es:mun:28079')
    expect(a.indexOf('es:prov:28')).toBeGreaterThan(0)
    expect(a.indexOf('es:prov:28')).toBeLessThan(a.indexOf('es:ccaa:29'))
    expect(searchGeo('madrid').map((m) => m.place.id)).toEqual(a)
    // Un empujón (la zona habitual de la agencia) adelanta entre iguales, pero no inventa coincidencias.
    // Varias «Villanueva de…» en distintas provincias, todas por prefijo: sin empujón manda la población
    // (Villanueva de la Serena, Badajoz); con el empujón de Madrid, la de Madrid (Villanueva de la Cañada).
    const plain = searchGeo('villanueva de', { limit: 20, kinds: ['municipality'] }).map((m) => m.place)
    const boosted = searchGeo('villanueva de', { limit: 20, kinds: ['municipality'], boost: (p) => (p.provinceId === 'es:prov:28' ? 5 : 0) }).map((m) => m.place)
    expect(plain[0]!.provinceId).not.toBe('es:prov:28')
    expect(boosted[0]!.provinceId).toBe('es:prov:28')
    expect(boosted.length).toBe(plain.length) // el empujón no añade ni quita coincidencias (hay más «Villanueva de…» que hueco: sólo cambia el orden)
    expect(boosted.every((p) => p.name.toLowerCase().startsWith('villanueva de'))).toBe(true)
    // Y un empujón nunca adelanta una coincidencia peor: «villa» exacta (una localidad) sigue antes que cualquier prefijo empujado.
    const exact = searchGeo('villa', { boost: (p) => (p.provinceId === 'es:prov:28' ? 9 : 0) })[0]!
    expect(exact.tier).toBe(5)
    expect(searchGeo('zzzzzzzz')).toEqual([])
    expect(searchGeo('')).toEqual([])
  })
})

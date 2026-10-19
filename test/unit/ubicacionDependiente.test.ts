import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildGeoCascade, withCurrent, COUNTRY_SPAIN, type GeoRaw } from '../../utils/geoCascade'

const root = join(import.meta.dirname, '../..')
const geo = buildGeoCascade(JSON.parse(readFileSync(join(root, 'public/geo/es.json'), 'utf8')) as GeoRaw)
const read = (f: string) => readFileSync(join(root, f), 'utf8')

describe('ubicación dependiente: catálogo', () => {
  it('lista las comunidades del catálogo del buscador, ordenadas', () => {
    const r = geo.regions()
    expect(r).toContain('Principado de Asturias')
    expect(r).toContain('Comunidad de Madrid')
    expect(r.length).toBe(19)
    expect([...r]).toEqual([...r].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })))
  })
  it('cada comunidad ofrece sólo sus provincias', () => {
    expect(geo.provinces('Principado de Asturias')).toEqual(['Asturias'])
    expect(geo.provinces('Comunidad de Madrid')).toEqual(['Madrid'])
    expect(geo.provinces('Andalucía')).toEqual(expect.arrayContaining(['Sevilla', 'Málaga']))
    expect(geo.provinces('Andalucía')).not.toContain('Madrid')
    expect(geo.provinces('No existe')).toEqual([])
  })
  it('cada provincia ofrece sólo sus municipios', () => {
    const asturias = geo.municipalities('Asturias')
    expect(asturias.some((m) => m.startsWith('Oviedo'))).toBe(true)
    expect(asturias.some((m) => m.startsWith('Gij'))).toBe(true)
    expect(asturias).not.toContain('Sevilla')
    expect(geo.municipalities('Sevilla')).toContain('Seville')
    expect(geo.municipalities('')).toEqual([])
  })
  it('las localidades del municipio llevan primero el propio municipio y sólo las suyas', () => {
    const oviedo = geo.municipalities('Asturias').find((m) => m.startsWith('Oviedo'))!
    const locs = geo.localities(oviedo, 'Asturias')
    expect(locs[0]).toBe(oviedo)
    expect(new Set(locs).size).toBe(locs.length)
    expect(geo.localities('Municipio inventado', 'Asturias')).toEqual(['Municipio inventado'])
  })
  it('una provincia dice a qué comunidad pertenece (elegir provincia primero rellena la comunidad)', () => {
    expect(geo.parentsOf('Asturias').region).toBe('Principado de Asturias')
    expect(geo.parentsOf('Nada').region).toBeNull()
  })
  it('un valor guardado que no está en el catálogo se conserva como opción (nada se pierde al abrir y guardar)', () => {
    expect(withCurrent(['A', 'B'], 'C')).toEqual(['C', 'A', 'B'])
    expect(withCurrent(['A', 'B'], 'A')).toEqual(['A', 'B'])
    expect(withCurrent(['A'], null)).toEqual(['A'])
    expect(withCurrent(['A'], '  ')).toEqual(['A'])
    expect(COUNTRY_SPAIN).toBe('España')
  })
})

describe('ubicación dependiente: editor', () => {
  const section = read('components/property-builder/LocationSection.vue')
  const cascade = read('components/property-builder/LocationCascade.vue')
  it('la sección de ubicación usa el desplegable dependiente y ya no pinta esos cinco campos sueltos', () => {
    expect(section).toContain('<LocationCascade')
    expect(section).toContain("['country', 'region', 'province', 'municipality', 'city']")
  })
  it('cambiar un nivel vacía los inferiores y el desplegable guarda los mismos campos de siempre', () => {
    for (const k of ['region', 'province', 'municipality', 'city', 'country']) expect(cascade).toContain(`props.form.${k}`)
    expect(cascade).toMatch(/onRegion[\s\S]*props\.form\.province = null[\s\S]*props\.form\.municipality = null/)
  })
  it('usa el catálogo estático del buscador, no una lista propia', () => {
    expect(cascade).toContain("'/geo/es.json'")
  })
})

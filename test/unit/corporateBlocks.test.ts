import { describe, expect, it } from 'vitest'
import { LIVE_STAT_KEYS, MAX_STATS, resolveStats, resolveTrustPoints } from '../../utils/corporateBlocks'
import { officeJsonLd, postalAddress, realEstateAgentJsonLd, teamMemberJsonLd } from '../../utils/corporateSchema'
import { BLOCK_PRESETS } from '../../composables/useSiteBuilderRegistry'

/**
 * Bloques corporativos de la portada (docs/home-corporativa.md): las cifras
 * son recuentos reales o datos escritos por la agencia, nunca valores
 * inventados por el bloque; los datos estructurados sólo llevan lo que
 * existe. Y los presets de la biblioteca no traen cifras de ejemplo que una
 * agencia pudiera publicar sin darse cuenta.
 */
const stats = { team: 6, offices: 3, properties: 10, zones: 21, languages: 4 }

describe('cifras de «Conoce nuestra inmobiliaria»', () => {
  it('resuelve las cifras en vivo con su recuento y una etiqueta en singular o plural', () => {
    expect(resolveStats({ stats: ['team', 'offices'] }, stats)).toEqual([
      { key: 'team', value: '6', label: 'asesores inmobiliarios', live: true },
      { key: 'offices', value: '3', label: 'oficinas', live: true },
    ])
    expect(resolveStats({ stats: ['offices'] }, { offices: 1 })[0].label).toBe('oficina')
  })

  it('una cifra en vivo a cero, desconocida o sin recuento no se enseña', () => {
    expect(resolveStats({ stats: ['zones', 'languages'] }, { zones: 0 })).toEqual([])
    expect(resolveStats({ stats: ['team'] }, null)).toEqual([])
    expect(resolveStats({ stats: ['inventada', 'team'] }, stats).map((s) => s.key)).toEqual(['team'])
  })

  it('la etiqueta se puede sobrescribir por bloque sin tocar el recuento', () => {
    const [s] = resolveStats({ stats: ['properties'], labelProperties: 'viviendas publicadas ahora mismo' }, stats)
    expect(s).toMatchObject({ value: '10', label: 'viviendas publicadas ahora mismo', live: true })
  })

  it('las cifras propias sólo salen con valor Y etiqueta, y se marcan como no en vivo', () => {
    const content = { stats: ['custom1', 'custom2', 'team'], customValue1: '+15', customLabel1: 'años de experiencia', customValue2: '800' }
    expect(resolveStats(content, stats)).toEqual([
      { key: 'custom1', value: '+15', label: 'años de experiencia', live: false },
      { key: 'team', value: '6', label: 'asesores inmobiliarios', live: true },
    ])
  })

  it('nunca más de cuatro cifras; sin lista, las tres de partida', () => {
    expect(resolveStats({ stats: [...LIVE_STAT_KEYS] }, stats)).toHaveLength(MAX_STATS)
    expect(resolveStats({}, stats).map((s) => s.key)).toEqual(['team', 'offices', 'properties'])
  })
})

describe('argumentos de «Nuestra experiencia, tu tranquilidad»', () => {
  it('devuelve tres o cuatro argumentos con título, en orden, y omite los vacíos', () => {
    const content = { count: 4, point1Title: 'Conocemos la zona', point1Text: 'x', point2Title: '', point3Title: 'Atención personal', point4Title: 'Confianza', point4Text: 'y' }
    expect(resolveTrustPoints(content).map((p) => [p.index, p.title, p.text])).toEqual([[1, 'Conocemos la zona', 'x'], [3, 'Atención personal', ''], [4, 'Confianza', 'y']])
    expect(resolveTrustPoints({ count: 3, point1Title: 'a', point2Title: 'b', point3Title: 'c', point4Title: 'd' })).toHaveLength(3)
    expect(resolveTrustPoints({ count: 9, point1Title: 'a', point4Title: 'd' })).toHaveLength(2)
  })
})

describe('presets corporativos de la biblioteca', () => {
  it('existen los tres y ninguno trae cifras propias ni copias de datos', () => {
    const types = BLOCK_PRESETS.filter((p) => ['about-agency', 'trust-points', 'offices'].includes(p.type))
    expect(types.map((p) => p.type).sort()).toEqual(['about-agency', 'offices', 'trust-points'])
    for (const p of types) expect(p.category).toBe('Empresa')
    const about = BLOCK_PRESETS.find((p) => p.presetId === 'about-agency')!.createContent()
    expect(about.stats.every((k: string) => (LIVE_STAT_KEYS as readonly string[]).includes(k)), 'el preset sólo propone cifras en vivo').toBe(true)
    expect(Object.keys(about).some((k) => k.startsWith('customValue'))).toBe(false)
    const offices = BLOCK_PRESETS.find((p) => p.presetId === 'offices')!.createContent()
    expect(offices.source).toBe('dynamic')
    expect(Object.keys(offices)).not.toContain('offices')
  })
})

describe('datos estructurados RealEstateAgent', () => {
  const company = { companyName: 'Norte Astur', logoUrl: 'https://na.example/logo.png', phone: '+34 985 000 100', email: 'info@norteastur.example', social: [{ url: 'https://instagram.example/norteastur' }] }
  const main = { id: 1, name: 'Oviedo Centro', address: 'Centro de Oviedo', city: 'Oviedo', province: 'Asturias', postalCode: '33003', country: 'España', phone: '+34 985 000 110', email: 'oviedo@norteastur.example', lat: 43.3619, lng: -5.8494, isMain: 1, description: 'La principal.' }
  const other = { id: 2, name: 'Gijón', city: 'Gijón', province: 'Asturias', isMain: 0 }

  it('la empresa lleva nombre, url, logo, teléfono, email, redes y la dirección de su oficina principal; las oficinas van como department', () => {
    const ld = realEstateAgentJsonLd('https://norteastur.example', company, [other, main])
    expect(ld).toMatchObject({ '@context': 'https://schema.org', '@type': 'RealEstateAgent', '@id': 'https://norteastur.example/#organization', name: 'Norte Astur', url: 'https://norteastur.example/', logo: company.logoUrl, telephone: company.phone, email: company.email, sameAs: ['https://instagram.example/norteastur'] })
    expect(ld.address).toEqual({ '@type': 'PostalAddress', streetAddress: 'Centro de Oviedo', addressLocality: 'Oviedo', addressRegion: 'Asturias', postalCode: '33003', addressCountry: 'España' })
    expect(ld.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 43.3619, longitude: -5.8494 })
    const departments = ld.department as any[]
    expect(departments.map((d) => d['@id'])).toEqual(['https://norteastur.example/oficinas#oficina-2', 'https://norteastur.example/oficinas#oficina-1'])
    expect(departments[1]).toMatchObject({ '@type': 'RealEstateAgent', name: 'Norte Astur · Oviedo Centro', telephone: main.phone, email: main.email, description: 'La principal.', parentOrganization: { '@id': 'https://norteastur.example/#organization' } })
  })

  it('no inventa nada: sin dato, sin campo (ni valoraciones, ni reseñas, ni fundación, ni horarios en texto libre)', () => {
    const ld = realEstateAgentJsonLd('https://x.example', { companyName: 'Agencia' }, [])
    expect(Object.keys(ld).sort()).toEqual(['@context', '@id', '@type', 'name', 'url'])
    const office = officeJsonLd('https://x.example', { companyName: 'Agencia' }, { id: 7, name: 'Sucursal', lat: null, lng: null })
    expect(Object.keys(office).sort()).toEqual(['@id', '@type', 'name', 'parentOrganization', 'url'])
    for (const key of ['aggregateRating', 'review', 'foundingDate', 'openingHours', 'openingHoursSpecification']) {
      expect(JSON.stringify(realEstateAgentJsonLd('https://x.example', company, [main]))).not.toContain(key)
    }
    expect(postalAddress({ id: 1, name: 'x' })).toBeNull()
    expect(postalAddress({ id: 1, name: 'x', city: 'Oviedo', province: 'Oviedo' })).toEqual({ '@type': 'PostalAddress', addressLocality: 'Oviedo' })
  })

  it('un comercial es una Person que trabaja para la inmobiliaria, sólo con lo que su ficha enseña', () => {
    const ld = teamMemberJsonLd('https://x.example', { companyName: 'Agencia' }, { slug: 'ana-perez', name: 'Ana Pérez', position: 'Asesora', languages: ['es', ' en ', ''], phone: null, email: null, imageUrl: null })
    expect(ld).toEqual({ '@context': 'https://schema.org', '@type': 'Person', name: 'Ana Pérez', url: 'https://x.example/equipo/ana-perez', worksFor: { '@type': 'RealEstateAgent', '@id': 'https://x.example/#organization', name: 'Agencia' }, jobTitle: 'Asesora', knowsLanguage: ['es', 'en'] })
  })
})

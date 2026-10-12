import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ZONE_AREA_LABEL,
  parseJsonArray,
  resolveZonePath,
  toZoneCard,
  zoneAreaLabel,
  zoneCatalogUrl,
  zoneCount,
  zoneForLocation,
  zoneMatch,
  zonePath,
  zoneSegments,
  zoneTree,
  type ZoneRow,
} from '../../server/utils/zones'
import type { LocationEntry } from '../../server/utils/properties/locationIndex'
import { normalizeText } from '../../utils/searchState'
import { ZONAS, ZONES_REVIEWED_AT, type DemoZone } from '../../server/demo/dataset/zonas'
import { ZONAS_BARRIOS } from '../../server/demo/dataset/zonasBarrios'

/**
 * Zonas (docs/zonas.md): la jerarquía región → municipio → barrio, sus rutas
 * públicas, con qué filtra cada una el catálogo y cómo cuenta propiedades
 * REALES (del índice de ubicaciones, nunca una cifra escrita a mano); y las
 * reglas editoriales del dataset de la demo Norte Astur.
 */

let seq = 0
function row(over: Partial<ZoneRow> & { id: number; slug: string; name: string; kind: ZoneRow['kind'] }): ZoneRow {
  seq += 1
  return {
    organizationId: 1,
    parentId: null,
    area: null,
    subtitle: null,
    intro: null,
    sectionsJson: null,
    faqJson: null,
    image: null,
    galleryJson: null,
    seoTitle: null,
    seoDescription: null,
    lat: null,
    lng: null,
    zoom: null,
    matchMunicipality: null,
    matchNeighborhood: null,
    homePriority: 0,
    sortOrder: seq,
    status: 'published',
    reviewedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    deletedAt: null,
    ...over,
  } as ZoneRow
}

const asturias = row({ id: 1, slug: 'asturias', name: 'Asturias', kind: 'region', intro: 'Asturias se vive…' })
const gijon = row({ id: 2, slug: 'gijon', name: 'Gijón', kind: 'municipality', parentId: 1, area: 'ciudades', matchMunicipality: 'Gijón', intro: 'Gijón es…', sortOrder: 10, homePriority: 6 })
const oviedo = row({ id: 3, slug: 'oviedo', name: 'Oviedo', kind: 'municipality', parentId: 1, area: 'ciudades', sortOrder: 5 })
const somio = row({ id: 4, slug: 'somio', name: 'Somió', kind: 'neighborhood', parentId: 2, matchNeighborhood: 'Somió', intro: 'Somió es…' })
const centroGijon = row({ id: 5, slug: 'centro', name: 'Centro', kind: 'neighborhood', parentId: 2 })
const centroOviedo = row({ id: 6, slug: 'centro', name: 'Centro', kind: 'neighborhood', parentId: 3, intro: 'El Centro de Oviedo…' })
const cudillero = row({ id: 7, slug: 'cudillero', name: 'Cudillero', kind: 'municipality', parentId: 1, area: 'cuencas-mineras', sortOrder: 50 })
const tree = zoneTree([somio, gijon, centroOviedo, asturias, oviedo, centroGijon, cudillero])

const entry = (kind: LocationEntry['kind'], value: string, count: number, context: string | null): LocationEntry => ({ kind, key: normalizeText(value), value, variants: [value], context, count })
const entries: LocationEntry[] = [
  entry('municipality', 'Gijón', 7, 'Asturias'),
  entry('municipality', 'Oviedo', 3, 'Asturias'),
  entry('neighborhood', 'Somió', 2, 'Gijón'),
  // «Centro» existe en dos municipios: el índice lo agrupa por nombre con el contexto más frecuente.
  entry('neighborhood', 'Centro', 4, 'Gijón'),
]

describe('zonas: árbol y rutas', () => {
  it('ordena los hijos por sortOrder y después por nombre', () => {
    expect((tree.children.get(1) || []).map((z) => z.slug)).toEqual(['oviedo', 'gijon', 'cudillero'])
    expect((tree.children.get(null) || []).map((z) => z.slug)).toEqual(['asturias'])
  })

  it('calcula la ruta pública desde la región hasta el barrio', () => {
    expect(zoneSegments(somio, tree)).toEqual(['asturias', 'gijon', 'somio'])
    expect(zonePath(somio, tree)).toBe('/zonas/asturias/gijon/somio')
    expect(zonePath(gijon, tree)).toBe('/zonas/asturias/gijon')
    expect(zonePath(asturias, tree)).toBe('/zonas/asturias')
  })

  it('resuelve una ruta a su zona y devuelve null si algún tramo no existe', () => {
    expect(resolveZonePath(tree, ['asturias', 'gijon', 'somio'])?.id).toBe(4)
    expect(resolveZonePath(tree, ['asturias', 'oviedo', 'centro'])?.id).toBe(6)
    expect(resolveZonePath(tree, ['asturias', 'gijon', 'centro'])?.id).toBe(5)
    expect(resolveZonePath(tree, ['asturias', 'nada'])).toBeNull()
    expect(resolveZonePath(tree, ['gijon'])).toBeNull()
    expect(resolveZonePath(tree, [])).toBeNull()
  })

  it('no se cuelga ante un ciclo de padres', () => {
    const a = row({ id: 90, slug: 'a', name: 'A', kind: 'municipality', parentId: 91 })
    const b = row({ id: 91, slug: 'b', name: 'B', kind: 'municipality', parentId: 90 })
    expect(zoneSegments(a, zoneTree([a, b]))).toEqual(['b', 'a'])
  })
})

describe('zonas: cruce con el catálogo', () => {
  it('un municipio filtra por su nombre si no se indica otro valor; un barrio hereda el municipio del padre', () => {
    expect(zoneMatch(gijon, tree)).toEqual({ municipality: 'Gijón', neighborhood: null })
    expect(zoneMatch(oviedo, tree)).toEqual({ municipality: 'Oviedo', neighborhood: null })
    expect(zoneMatch(somio, tree)).toEqual({ municipality: 'Gijón', neighborhood: 'Somió' })
    expect(zoneMatch(centroOviedo, tree)).toEqual({ municipality: 'Oviedo', neighborhood: 'Centro' })
    expect(zoneMatch(asturias, tree)).toEqual({ municipality: null, neighborhood: null })
  })

  it('el enlace al catálogo lleva los mismos parámetros que /propiedades', () => {
    expect(zoneCatalogUrl(gijon, tree)).toBe('/propiedades?operacion=venta&municipality=Gij%C3%B3n')
    expect(zoneCatalogUrl(somio, tree)).toBe('/propiedades?operacion=venta&municipality=Gij%C3%B3n&neighborhood=Somi%C3%B3')
    expect(zoneCatalogUrl(asturias, tree)).toBe('/propiedades?operacion=venta')
  })

  it('cuenta propiedades reales del índice: barrio dentro de su municipio, municipio, región como suma', () => {
    expect(zoneCount(somio, tree, entries)).toBe(2)
    expect(zoneCount(centroGijon, tree, entries)).toBe(4)
    // «Centro» de Oviedo no es «Centro» de Gijón: sin entrada en su municipio, cero.
    expect(zoneCount(centroOviedo, tree, entries)).toBe(0)
    expect(zoneCount(gijon, tree, entries)).toBe(7)
    expect(zoneCount(oviedo, tree, entries)).toBe(3)
    expect(zoneCount(cudillero, tree, entries)).toBe(0)
    expect(zoneCount(asturias, tree, entries)).toBe(10)
    expect(zoneCount(gijon, tree, [])).toBe(0)
  })

  it('la tarjeta lleva ruta, recuento, enlace, si tiene guía, su zona superior y sus hijas', () => {
    const card = toZoneCard(gijon, tree, entries)
    expect(card).toMatchObject({ id: 2, slug: 'gijon', path: '/zonas/asturias/gijon', kind: 'municipality', area: 'ciudades', areaLabel: 'Principales ciudades', count: 7, hasGuide: true, childrenCount: 2 })
    expect(card.parent).toEqual({ name: 'Asturias', path: '/zonas/asturias' })
    const plain = toZoneCard(oviedo, tree, entries)
    expect(plain.hasGuide).toBe(false)
    expect(plain.catalogUrl).toBe('/propiedades?operacion=venta&municipality=Oviedo')
    expect(toZoneCard(asturias, tree, entries).parent).toBeNull()
  })

  it('las etiquetas de área conocidas tienen nombre propio; las demás se capitalizan', () => {
    expect(Object.keys(ZONE_AREA_LABEL)).toEqual(['ciudades', 'oriente', 'centro', 'occidente'])
    expect(zoneAreaLabel('oriente')).toBe('Oriente')
    expect(zoneAreaLabel('cuencas-mineras')).toBe('Cuencas-mineras')
    expect(zoneAreaLabel(null)).toBeNull()
  })

  it('elige la guía de una propiedad: su barrio si existe, si no su municipio; nada si no hay guía', () => {
    expect(zoneForLocation(tree, 'Gijón', 'Somió')?.id).toBe(4)
    expect(zoneForLocation(tree, 'gijon', 'SOMIO')?.id).toBe(4)
    expect(zoneForLocation(tree, 'Oviedo', 'Centro')?.id).toBe(6)
    expect(zoneForLocation(tree, 'Gijón', 'Centro')?.id).toBe(5)
    expect(zoneForLocation(tree, 'Gijón', 'Un barrio sin guía')?.id).toBe(2)
    expect(zoneForLocation(tree, 'Oviedo', null)?.id).toBe(3)
    expect(zoneForLocation(tree, 'Avilés', null)).toBeNull()
    expect(zoneForLocation(tree, null, null)).toBeNull()
  })

  it('parseJsonArray tolera JSON inválido o que no sea una lista', () => {
    expect(parseJsonArray('[{"title":"a","text":"b"}]')).toEqual([{ title: 'a', text: 'b' }])
    expect(parseJsonArray('{"a":1}')).toEqual([])
    expect(parseJsonArray('no es json')).toEqual([])
    expect(parseJsonArray(null)).toEqual([])
  })
})

// ------------------------------------------------------------ dataset de la demo

const DEMO: DemoZone[] = [...ZONAS, ...ZONAS_BARRIOS]
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const textsOf = (z: DemoZone): string[] => [z.subtitle, z.intro, z.seoTitle, z.seoDescription, ...(z.sections || []).flatMap((s) => [s.title, s.text]), ...(z.faq || []).flatMap((f) => [f.q, f.a])].filter((x): x is string => Boolean(x))
const FORBIDDEN = ['lugar ideal', 'ubicación privilegiada', 'entorno inmejorable', 'lorem ipsum']
const GUIDES = ['gijon', 'oviedo', 'aviles', 'llanes', 'ribadesella', 'villaviciosa']

describe('zonas: dataset de la demo Norte Astur', () => {
  it('tiene una región, 21 municipios (6 con guía) y 15 barrios de Gijón y Oviedo, todos con clave y slug únicos por nivel', () => {
    expect(DEMO).toHaveLength(37)
    expect(DEMO.filter((z) => z.kind === 'region')).toHaveLength(1)
    expect(DEMO.filter((z) => z.kind === 'municipality')).toHaveLength(21)
    expect(DEMO.filter((z) => z.kind === 'neighborhood')).toHaveLength(15)
    expect(new Set(DEMO.map((z) => z.key)).size).toBe(DEMO.length)
    expect(new Set(DEMO.map((z) => `${z.parent || ''}/${z.slug}`)).size).toBe(DEMO.length)
    for (const z of DEMO) expect(z.slug, z.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cada zona superior existe y va ANTES que sus hijas (la semilla las crea en orden)', () => {
    const index = new Map(DEMO.map((z, i) => [z.key, i]))
    for (const [i, z] of DEMO.entries()) {
      if (z.kind === 'region') {
        expect(z.parent, z.key).toBeUndefined()
        continue
      }
      expect(z.parent, `${z.key} sin zona superior`).toBeTruthy()
      expect(index.has(z.parent!), `${z.key}: zona superior ${z.parent} inexistente`).toBe(true)
      expect(index.get(z.parent!)!, `${z.key} va antes que su zona superior`).toBeLessThan(i)
      const parent = DEMO[index.get(z.parent!)!]
      if (z.kind === 'municipality') expect(parent.kind).toBe('region')
      else expect(parent.kind).toBe('municipality')
    }
  })

  it('los municipios del directorio están agrupados en las cuatro áreas del megaprompt', () => {
    const byArea = (a: DemoZone['area']) => DEMO.filter((z) => z.kind === 'municipality' && z.area === a).map((z) => z.slug)
    expect(byArea('ciudades')).toEqual(['gijon', 'oviedo', 'aviles'])
    expect(byArea('oriente')).toEqual(['llanes', 'ribadesella', 'villaviciosa', 'colunga', 'cangas-de-onis', 'parres'])
    expect(byArea('centro')).toEqual(['siero', 'llanera', 'norena', 'mieres', 'langreo', 'castrillon'])
    expect(byArea('occidente')).toEqual(['cudillero', 'valdes', 'navia', 'tapia-de-casariego', 'castropol', 'vegadeo'])
  })

  it('las seis guías municipales tienen intro, al menos cinco secciones y tres preguntas, y son las únicas con prioridad en la portada', () => {
    const guides = DEMO.filter((z) => z.kind === 'municipality' && z.intro)
    expect(guides.map((z) => z.slug).sort()).toEqual([...GUIDES].sort())
    for (const g of guides) {
      expect(g.status, g.key).toBe('published')
      expect(words(g.intro!), `${g.key}: intro corta`).toBeGreaterThanOrEqual(120)
      expect((g.sections || []).length, `${g.key}: secciones`).toBeGreaterThanOrEqual(5)
      expect((g.faq || []).length, `${g.key}: preguntas`).toBeGreaterThanOrEqual(3)
      expect(g.image, `${g.key}: sin foto`).toBeTruthy()
      expect(g.matchMunicipality, `${g.key}: sin cruce con el catálogo`).toBeTruthy()
      expect(g.seoTitle && g.seoDescription, `${g.key}: sin SEO`).toBeTruthy()
      expect(g.homePriority || 0, `${g.key}: prioridad en la portada`).toBeGreaterThan(0)
    }
    const withPriority = DEMO.filter((z) => (z.homePriority || 0) > 0)
    expect(withPriority.map((z) => z.slug).sort()).toEqual([...GUIDES].sort())
    expect(new Set(withPriority.map((z) => z.homePriority)).size).toBe(withPriority.length)
    for (const m of DEMO.filter((z) => z.kind === 'municipality' && !z.intro)) {
      expect(m.sections || [], `${m.key}: un municipio sin guía no lleva secciones`).toHaveLength(0)
    }
  })

  it('los barrios tienen contenido propio: intro, secciones y preguntas, dentro de Gijón u Oviedo', () => {
    for (const b of DEMO.filter((z) => z.kind === 'neighborhood')) {
      expect(['gijon', 'oviedo'], b.key).toContain(b.parent)
      expect(words(b.intro || ''), `${b.key}: intro corta`).toBeGreaterThanOrEqual(60)
      expect((b.sections || []).length, `${b.key}: secciones`).toBeGreaterThanOrEqual(3)
      expect((b.faq || []).length, `${b.key}: preguntas`).toBeGreaterThanOrEqual(2)
      expect(b.matchNeighborhood, `${b.key}: sin cruce con el catálogo`).toBeTruthy()
    }
  })

  it('ningún texto se repite entre zonas: intros, secciones y preguntas son distintas', () => {
    const seen = new Map<string, string>()
    for (const z of DEMO) {
      for (const t of [z.intro, ...(z.sections || []).map((s) => s.text), ...(z.faq || []).map((f) => f.a)]) {
        if (!t) continue
        const k = normalizeText(t)
        expect(seen.has(k), `${z.key} repite un texto de ${seen.get(k)}`).toBe(false)
        seen.set(k, z.key)
      }
    }
  })

  it('reglas editoriales: sin muletillas prohibidas, sin precios, porcentajes ni estadísticas inventadas', () => {
    for (const z of DEMO) {
      for (const t of textsOf(z)) {
        const low = t.toLowerCase()
        for (const f of FORBIDDEN) expect(low.includes(f), `${z.key}: «${f}»`).toBe(false)
        expect(/[€%]/.test(t), `${z.key}: precio o porcentaje en «${t.slice(0, 60)}»`).toBe(false)
        expect(/\d+\s*(habitantes|€|euros|m2|m²)/i.test(t), `${z.key}: cifra inventada en «${t.slice(0, 60)}»`).toBe(false)
      }
    }
  })

  it('SEO: títulos y descripciones con longitud razonable; el directorio lleva el título del megaprompt', () => {
    const region = DEMO.find((z) => z.kind === 'region')!
    expect(region.seoTitle).toBe('Dónde vivir en Asturias: descubre sus ciudades, pueblos y mejores zonas')
    for (const z of DEMO) {
      if (z.seoTitle) expect(z.seoTitle.length, `${z.key}: title`).toBeLessThanOrEqual(75)
      if (z.seoDescription) expect(z.seoDescription.length, `${z.key}: meta`).toBeLessThanOrEqual(170)
    }
  })

  it('coordenadas dentro de Asturias, fecha de revisión y fotos que existen en los recursos de la demo', () => {
    expect(ZONES_REVIEWED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const root = join(__dirname, '..', '..', 'public', 'demo-assets', 'norte-astur')
    for (const z of DEMO) {
      expect(z.lat, z.key).toBeGreaterThan(42.8)
      expect(z.lat, z.key).toBeLessThan(43.7)
      expect(z.lng, z.key).toBeGreaterThan(-7.2)
      expect(z.lng, z.key).toBeLessThan(-4.4)
      if (z.image) expect(existsSync(join(root, z.image)), `${z.key}: falta ${z.image}`).toBe(true)
    }
  })
})

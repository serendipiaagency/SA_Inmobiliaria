import { beforeAll, describe, expect, it } from 'vitest'
import { and } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { createTestDb } from './helpers/tenantFixtures'
import { buildPublicSearch } from '../../server/utils/properties/publicSearch'
import { forgetLocationIndex } from '../../server/utils/properties/locationIndex'
import { resolveLocationIds, geoParents } from '../../server/utils/geo/locations'
import { geoPlace, loadGeoCatalog } from '../../server/utils/geo/catalog'
import { defaultLocationSuggestions, suggestLocationsFor } from '../../server/utils/geo/suggest'
import { coveredBy, locationsPatch, parseLocations } from '../../utils/searchState'

/**
 * Ubicación por ENTIDAD: el catálogo de España (ids canónicos) filtra por su
 * ámbito real sobre las fichas de cada agencia, las sugerencias funden
 * catálogo, inventario y zonas, y nada cruza de una agencia a otra.
 */
const P = schema.developerProperties
let db: any
let orgA = 0
let orgB = 0
let zoneA = 0
let zoneB = 0
const ts = '2026-01-01 00:00:00'

async function org(name: string) {
  const [o] = await db.insert(schema.organizations).values({ name, slug: `geo-${name}`, status: 'active', createdAt: ts, updatedAt: ts }).returning({ id: schema.organizations.id })
  const [d] = await db.insert(schema.developers).values({ organizationId: o.id, name: `${name} Dev`, status: 'active', createdAt: ts, updatedAt: ts }).returning({ id: schema.developers.id })
  return [o.id as number, d.id as number]
}
async function prop(orgId: number, developerId: number, name: string, values: Record<string, unknown>, details?: Record<string, unknown>) {
  const [row] = await db
    .insert(P)
    .values({ organizationId: orgId, developerId, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'ready', price: 100_000, createdAt: ts, updatedAt: ts, publishedAt: ts, ...values })
    .returning({ id: P.id })
  if (details) await db.insert(schema.propertyDetails).values({ organizationId: orgId, propertyKind: 'developer', propertyId: row.id, createdAt: ts, updatedAt: ts, ...details })
}
async function names(orgId: number, query: Record<string, unknown>): Promise<string[]> {
  const s = await buildPublicSearch(db, orgId, query)
  const rows = await db.select({ name: P.name }).from(P).where(and(...s.conds))
  return rows.map((r: { name: string }) => r.name).sort()
}

beforeAll(async () => {
    await loadGeoCatalog()
  ;({ db } = createTestDb())
  const [a, devA] = await org('a')
  const [b, devB] = await org('b')
  orgA = a
  orgB = b
  await prop(orgA, devA, 'Somió', { city: 'GIJÓN', community: 'Somió', postalCode: '33203', lat: 43.543, lng: -5.629 })
  await prop(orgA, devA, 'Centro Gijón', { city: 'Gijón', postalCode: '33201' })
  await prop(orgA, devA, 'Oviedo ficha', { city: '', postalCode: null }, { province: 'Asturias', municipality: 'Oviedo', neighborhood: 'Centro' })
  await prop(orgA, devA, 'Sólo CP', { city: null, postalCode: '33510' }) // Pola de Siero: su municipio sale del catálogo
  await prop(orgA, devA, 'Calle', { city: 'Gijón', street: 'Calle Corrida', locationPrivacy: 'exact' })
  await prop(orgA, devA, 'Madrid', { city: 'Madrid', postalCode: '28001' })
  await prop(orgB, devB, 'Ajena Gijón', { city: 'Gijón', community: 'Somió', postalCode: '33201' })
  const [za] = await db.insert(schema.zones).values({ organizationId: orgA, kind: 'municipality', slug: 'gijon', name: 'Gijón', matchMunicipality: 'Gijón', status: 'published', homePriority: 5, createdAt: ts, updatedAt: ts }).returning({ id: schema.zones.id })
  const [zb] = await db.insert(schema.zones).values({ organizationId: orgB, kind: 'municipality', slug: 'gijon', name: 'Gijón ajena', matchMunicipality: 'Gijón', status: 'published', createdAt: ts, updatedAt: ts }).returning({ id: schema.zones.id })
  zoneA = za.id
  zoneB = zb.id
  forgetLocationIndex()
})

describe('contrato de búsqueda: ids en la URL', () => {
  it('lee `loc` (ids canónicos) y los textos de siempre, sin repetir, y los vuelve a escribir', () => {
    const list = parseLocations({ loc: 'es:mun:33024,zone:12,es:cp:33201,basura:1', municipality: ['Gijón', 'Oviedo'], street: 'Calle Corrida' })
    expect(list.map((l) => l.id ?? l.value)).toEqual(['es:mun:33024', 'zone:12', 'es:cp:33201', 'Gijón', 'Oviedo', 'Calle Corrida'])
    expect(list[0]!.kind).toBe('municipality')
    expect(list[1]!.kind).toBe('zone')
    expect(list[2]).toMatchObject({ kind: 'postalCode', value: '33201' })
    const patch = locationsPatch(list)
    expect(patch.loc).toBe('es:mun:33024,zone:12,es:cp:33201')
    expect(patch.municipality).toEqual(['Gijón', 'Oviedo'])
    expect(patch.street).toEqual(['Calle Corrida'])
    expect(patch.province).toBeUndefined()
  })

  it('una ubicación contenida en otra elegida se señala (unión, nunca contradicción)', () => {
    const all = parseLocations({ loc: 'es:prov:33,es:mun:33024,es:loc:3108732' })
    expect(coveredBy(all[1]!, all, geoParents)).toBe('es:prov:33')
    expect(coveredBy(all[2]!, all, geoParents)).toBe('es:mun:33024')
    expect(coveredBy(all[0]!, all, geoParents)).toBeNull()
    expect(geoParents('es:cp:33201')).toEqual(['es:mun:33024', 'es:prov:33', 'es:ccaa:34'])
  })
})

describe('filtro por entidad geográfica', () => {
  it('municipio: su nombre (con variantes guardadas) o un código postal suyo', async () => {
    expect(await names(orgA, { loc: 'es:mun:33024' })).toEqual(['Calle', 'Centro Gijón', 'Somió'])
    // Oviedo sólo está en la ficha ampliada; «Sólo CP» (33440, Carreño) no es de Gijón.
    expect(await names(orgA, { loc: 'es:mun:33044' })).toEqual(['Oviedo ficha'])
    const siero = geoPlace('es:cp:33510')!.municipalityId!
    expect(await names(orgA, { loc: siero })).toEqual(['Sólo CP']) // por su CP, sin ciudad en la ficha
  })
  it('provincia y comunidad: por nombre en la ficha, por sus municipios o por el prefijo del CP', async () => {
    const prov = await names(orgA, { loc: 'es:prov:33' })
    expect(prov, `provincia 33 → ${prov.join(' | ')}`).toEqual(['Calle', 'Centro Gijón', 'Oviedo ficha', 'Somió', 'Sólo CP'])
    expect(await names(orgA, { loc: 'es:ccaa:34' })).toEqual(['Calle', 'Centro Gijón', 'Oviedo ficha', 'Somió', 'Sólo CP'])
    expect(await names(orgA, { loc: 'es:prov:28' })).toEqual(['Madrid'])
    expect(await names(orgA, { loc: 'es:prov:08' })).toEqual([])
  })
  it('localidad: su nombre dentro de su municipio; código postal exacto; varias a la vez se unen', async () => {
    expect(await names(orgA, { loc: 'es:loc:3108732' })).toEqual(['Somió'])
    expect(await names(orgA, { loc: 'es:cp:33201' })).toEqual(['Centro Gijón'])
    expect(await names(orgA, { loc: 'es:cp:33201,es:mun:33044' })).toEqual(['Centro Gijón', 'Oviedo ficha'])
    expect(await names(orgA, { loc: 'es:mun:33044', municipality: 'Madrid' })).toEqual(['Madrid', 'Oviedo ficha'])
  })
  it('zona de la agencia: lo que declara; una zona ajena o un id desconocido no encuentran nada', async () => {
    expect(await names(orgA, { loc: `zone:${zoneA}` })).toEqual(['Calle', 'Centro Gijón', 'Somió'])
    expect(await names(orgA, { loc: `zone:${zoneB}` })).toEqual([])
    expect(await names(orgA, { loc: 'es:mun:99999' })).toEqual([])
    expect(await names(orgB, { loc: 'es:mun:33024' })).toEqual(['Ajena Gijón'])
  })
})

describe('sugerencias: catálogo + inventario + zonas', () => {
  it('lo escrito: la entidad real con el inventario de la agencia, sin inventar sitios ni contar lo ajeno', async () => {
    const gij = await suggestLocationsFor(db, orgA, 'gij')
    expect(gij[0]).toMatchObject({ id: 'es:mun:33024', kind: 'municipality', value: 'Gijón/Xixón', context: 'Asturias', count: 3, source: 'inventory' })
    expect(gij.some((i) => i.id === `zone:${zoneA}` && i.kind === 'zone' && i.count === 3)).toBe(true)
    expect(gij.some((i) => i.id === `zone:${zoneB}`)).toBe(false)
    const somio = await suggestLocationsFor(db, orgA, 'somio')
    expect(somio[0]).toMatchObject({ id: 'es:loc:3108732', kind: 'neighborhood', value: 'Somió', context: 'Gijón/Xixón', count: 1 })
    const madrid = await suggestLocationsFor(db, orgB, 'madrid')
    expect(madrid[0]).toMatchObject({ id: 'es:mun:28079', count: null, source: 'catalog' })
    // Una calle sólo existe en el inventario (sin id) y sólo para su agencia.
    expect((await suggestLocationsFor(db, orgA, 'corrida')).some((i) => i.kind === 'street' && i.id === null && i.value === 'Calle Corrida')).toBe(true)
    expect((await suggestLocationsFor(db, orgB, 'corrida')).some((i) => i.kind === 'street')).toBe(false)
    // Tolerancia: «oviedp» → Oviedo; «xixon» → Gijón.
    expect((await suggestLocationsFor(db, orgA, 'oviedp'))[0]!.id).toBe('es:mun:33044')
    expect((await suggestLocationsFor(db, orgA, 'xixon'))[0]!.id).toBe('es:mun:33024')
    // El contexto de la agencia reordena: «san» en Asturias primero para la agencia A, pero sin excluir el resto.
    const san = await suggestLocationsFor(db, orgA, 'san martin')
    expect(san.length).toBeGreaterThan(3)
  })
  it('sin texto: destacadas, lo que más inventario tiene y las zonas; nada «popular» inventado', async () => {
    const def = await defaultLocationSuggestions(db, orgA, { featured: ['es:mun:28079'] })
    expect(def[0]).toMatchObject({ id: 'es:mun:28079', count: 1 })
    expect(def.some((i) => i.id === 'es:mun:33024' && i.count === 3)).toBe(true)
    expect(def.some((i) => i.id === `zone:${zoneA}`)).toBe(true)
    expect(def.every((i) => i.count != null || i.kind === 'zone')).toBe(true)
  })
  it('resolver ids: nombre y contexto; las zonas sólo de la propia agencia', async () => {
    const items = await resolveLocationIds(db, orgA, ['es:mun:33024', `zone:${zoneA}`, `zone:${zoneB}`, 'es:cp:33201', 'nada'])
    expect(items.map((i) => i.id)).toEqual(['es:mun:33024', `zone:${zoneA}`, 'es:cp:33201'])
    expect(items[0]).toMatchObject({ value: 'Gijón/Xixón', context: 'Asturias', kind: 'municipality' })
    expect(items[1]).toMatchObject({ value: 'Gijón', kind: 'zone' })
    expect(items[2]).toMatchObject({ value: '33201', kind: 'postalCode' })
  })
})

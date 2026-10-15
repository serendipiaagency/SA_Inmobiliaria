import { beforeAll, describe, expect, it } from 'vitest'
import { and } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { createTestDb } from './helpers/tenantFixtures'
import { buildPublicSearch } from '../../server/utils/properties/publicSearch'
import { GeoFilterError, MAX_POLYGON_POINTS, geoQueryKeys, limitPolygonPoints, parseGeoQuery, parsePolygonParam, pointInPolygon, polygonBounds, polygonParam, simplifyPath } from '../../utils/maps/geo'
import { countActivePublicFilters, hasPolygon, withoutPolygon } from '../../utils/publicSearch'
import { catalogChips, chipRemovalPatch } from '../../utils/catalogChips'
import { mapAreasFromSuggestions } from '../../utils/maps/areas'

/**
 * Zona dibujada en el mapa (Parte II del buscador): el parámetro `poly`, su
 * validación, punto-en-polígono, la caja, la simplificación del trazo, el
 * chip y el contador de filtros; y el filtro real sobre las coordenadas que
 * se publican, con aislamiento entre agencias.
 */

const t = (_k: string, fallback: string) => fallback
const SQUARE = [
  { lat: 43.0, lng: -5.0 },
  { lat: 43.0, lng: -4.0 },
  { lat: 44.0, lng: -4.0 },
  { lat: 44.0, lng: -5.0 },
]

describe('parámetro poly', () => {
  it('lee y escribe la zona con 5 decimales, sin el cierre repetido', () => {
    const raw = '43.1,-5.2;43.1,-4.2;44.123456,-4.2;43.1,-5.2'
    const pts = parsePolygonParam(raw)
    expect(pts).toEqual([
      { lat: 43.1, lng: -5.2 },
      { lat: 43.1, lng: -4.2 },
      { lat: 44.12346, lng: -4.2 },
    ])
    expect(polygonParam(pts)).toBe('43.1,-5.2;43.1,-4.2;44.12346,-4.2')
    expect(parseGeoQuery({ poly: raw }).polygon).toEqual(pts)
    expect(parseGeoQuery({}).polygon).toBeUndefined()
    expect(geoQueryKeys()).toContain('poly')
  })

  it('un poly mal formado es un error, nunca «todas»', () => {
    expect(() => parsePolygonParam('43,-5;43,-4')).toThrow(/al menos 3/)
    expect(() => parsePolygonParam('43,-5;43,-4;43,-3')).toThrow(/no tiene superficie/)
    expect(() => parsePolygonParam('43,-5;x,-4;44,-4')).toThrow(GeoFilterError)
    expect(() => parsePolygonParam('43,-5;95,-4;44,-4')).toThrow(/Latitud/)
    expect(() => parsePolygonParam(Array.from({ length: MAX_POLYGON_POINTS + 1 }, (_, i) => `43.${i},-5.${i}`).join(';'))).toThrow(/demasiados vértices/)
  })

  it('punto en polígono (trazado de rayo) y caja envolvente', () => {
    expect(pointInPolygon({ lat: 43.5, lng: -4.5 }, SQUARE)).toBe(true)
    expect(pointInPolygon({ lat: 42.5, lng: -4.5 }, SQUARE)).toBe(false)
    expect(pointInPolygon({ lat: 43.5, lng: -3.9 }, SQUARE)).toBe(false)
    // Sobre un vértice o una arista: dentro.
    expect(pointInPolygon({ lat: 43.0, lng: -5.0 }, SQUARE)).toBe(true)
    expect(pointInPolygon({ lat: 43.0, lng: -4.5 }, SQUARE)).toBe(true)
    // Un polígono cóncavo (una L): el hueco queda fuera.
    const ele = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 1, lng: 3 },
      { lat: 1, lng: 1 },
      { lat: 3, lng: 1 },
      { lat: 3, lng: 0 },
    ]
    expect(pointInPolygon({ lat: 0.5, lng: 2 }, ele)).toBe(true)
    expect(pointInPolygon({ lat: 2, lng: 2 }, ele)).toBe(false)
    expect(polygonBounds(SQUARE)).toEqual({ north: 44, south: 43, east: -4, west: -5 })
  })

  it('simplifica un trazo a mano alzada y acota los vértices', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 0 : 0.5 }))
    const simple = simplifyPath(line, 2)
    expect(simple.length).toBeLessThan(5)
    expect(simple[0]).toEqual(line[0])
    expect(simple[simple.length - 1]).toEqual(line[line.length - 1])
    const many = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i }))
    const limited = limitPolygonPoints(many, 120)
    expect(limited.length).toBe(120)
    expect(limited[0]).toEqual(many[0])
    expect(limited[119]).toEqual(many[499])
    expect(limitPolygonPoints([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  it('chip «Zona dibujada» y contador de filtros activos', () => {
    const q = { poly: polygonParam(SQUARE), minPrice: '100' }
    expect(hasPolygon(q)).toBe(true)
    expect(countActivePublicFilters(q)).toBe(2)
    expect(withoutPolygon(q)).toEqual({ minPrice: '100' })
    const chips = catalogChips(q, t, (n) => `${n} €`, (x) => x)
    const chip = chips.find((c) => c.key === 'polygon')!
    expect(chip.label).toBe('Zona dibujada')
    expect(chipRemovalPatch(q, chip)).toEqual({ page: undefined, poly: undefined })
  })

  it('áreas pulsables: sólo entidades con id, coordenadas y propiedades, sin repetir', () => {
    const areas = mapAreasFromSuggestions([
      { id: 'es:mun:33024', kind: 'municipality', value: 'Gijón', context: 'Asturias', count: 4, lat: 43.53, lng: -5.67 },
      { id: 'es:mun:33024', kind: 'municipality', value: 'Gijón', context: 'Asturias', count: 4, lat: 43.53, lng: -5.67 },
      { id: 'es:prov:33', kind: 'province', value: 'Asturias', context: null, count: 9, lat: 43.3, lng: -5.9 },
      { id: 'zone:3', kind: 'zone', value: 'Centro', context: 'Gijón', count: 2, lat: 43.54, lng: -5.66 },
      { id: 'es:mun:33044', kind: 'municipality', value: 'Oviedo', context: 'Asturias', count: null, lat: 43.36, lng: -5.85 },
      { id: null, kind: 'street', value: 'Calle Uría', context: 'Oviedo', count: 1 },
    ])
    expect(areas.map((a) => a.id)).toEqual(['es:mun:33024', 'zone:3'])
  })
})

describe('filtro real de la zona dibujada', () => {
  const P = schema.developerProperties
  let db: any
  let orgA = 0
  let orgB = 0
  const ts = '2026-01-01 00:00:00'

  async function org(name: string) {
    const [o] = await db.insert(schema.organizations).values({ name, slug: `poly-${name}`, status: 'active', createdAt: ts, updatedAt: ts }).returning({ id: schema.organizations.id })
    const [d] = await db.insert(schema.developers).values({ organizationId: o.id, name: `${name} Dev`, status: 'active', createdAt: ts, updatedAt: ts }).returning({ id: schema.developers.id })
    return [o.id as number, d.id as number]
  }
  async function prop(orgId: number, developerId: number, name: string, values: Record<string, unknown>) {
    await db.insert(P).values({ organizationId: orgId, developerId, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'ready', price: 100_000, createdAt: ts, updatedAt: ts, publishedAt: ts, ...values })
  }
  async function names(orgId: number, query: Record<string, unknown>): Promise<string[]> {
    const s = await buildPublicSearch(db, orgId, query)
    const rows = await db.select({ name: P.name }).from(P).where(and(...s.conds))
    return rows.map((r: { name: string }) => r.name).sort()
  }

  beforeAll(async () => {
    db = createTestDb().db
    const [a, devA] = await org('A')
    const [b, devB] = await org('B')
    orgA = a
    orgB = b
    await prop(orgA, devA, 'Dentro', { lat: 43.5, lng: -4.5 })
    await prop(orgA, devA, 'En la caja pero fuera', { lat: 43.9, lng: -4.9, locationPrivacy: 'exact' })
    await prop(orgA, devA, 'Fuera', { lat: 42.0, lng: -4.5 })
    await prop(orgA, devA, 'Sin coordenadas', { lat: null, lng: null })
    // Aproximada: su pin publicado se redondea a la cuadrícula del radio de privacidad (5 km ≈ 0,045°).
    await prop(orgA, devA, 'Aproximada al borde', { lat: 43.01, lng: -4.5, locationPrivacy: 'approximate', locationPrivacyRadius: 5000 })
    await prop(orgB, devB, 'De otra agencia', { lat: 43.5, lng: -4.5 })
  })

  it('sólo las propiedades vivas de la agencia cuyo pin publicado cae dentro; un poly inválido es un 422', async () => {
    // Un triángulo que deja fuera la esquina noroeste de la caja (la «En la caja pero fuera» pasa el prefiltro SQL y cae en memoria).
    const tri = polygonParam([
      { lat: 43.0, lng: -5.0 },
      { lat: 43.0, lng: -4.0 },
      { lat: 44.0, lng: -4.0 },
    ])
    expect(await names(orgA, { poly: tri })).toEqual(['Aproximada al borde', 'Dentro'])
    expect(await names(orgA, { poly: polygonParam(SQUARE) })).toEqual(['Aproximada al borde', 'Dentro', 'En la caja pero fuera'])
    expect(await names(orgB, { poly: polygonParam(SQUARE) })).toEqual(['De otra agencia'])
    // La aproximada entra por su pin publicado (redondeado a la cuadrícula de 5 km: 43,02), no por el real.
    await expect(buildPublicSearch(db, orgA, { poly: '43,-5;43,-4' })).rejects.toMatchObject({ statusCode: 422 })
    // Sin ninguna dentro: nada (nunca «todas»).
    expect(await names(orgA, { poly: polygonParam([{ lat: 10, lng: 10 }, { lat: 10, lng: 11 }, { lat: 11, lng: 11 }]) })).toEqual([])
  })
})

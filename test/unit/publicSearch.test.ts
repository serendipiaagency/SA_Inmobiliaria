import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { createTestDb } from './helpers/tenantFixtures'
import { buildPublicSearch, publicSearchOrder } from '../../server/utils/properties/publicSearch'
import { forgetLocationIndex, locationIndex, suggestLocations } from '../../server/utils/properties/locationIndex'
import { pricePerSquareMeter } from '../../utils/propertySheet'

/**
 * Property Search de la web pública contra SQLite real con todas las
 * migraciones (no un esquema de mentira): filtros, ubicación múltiple sin
 * tildes, tipos y subtipos, estado, situación, alquiler, las ocho
 * ordenaciones y el aislamiento entre agencias.
 */

const P = schema.developerProperties
let db: any
let orgA = 0
let orgB = 0
let devA = 0
let devB = 0
const ids: Record<string, number> = {}

async function org(name: string) {
  const [o] = await db.insert(schema.organizations).values({ name, slug: `ps-${name}`, status: 'active', createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00' }).returning({ id: schema.organizations.id })
  const [d] = await db.insert(schema.developers).values({ organizationId: o.id, name: `${name} Dev`, status: 'active', createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00' }).returning({ id: schema.developers.id })
  return [o.id as number, d.id as number]
}

async function prop(orgId: number, developerId: number, name: string, values: Record<string, unknown>, details?: Record<string, unknown>, legal?: Record<string, unknown>) {
  const ts = '2026-01-01 00:00:00'
  const [row] = await db
    .insert(P)
    .values({ organizationId: orgId, developerId, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'ready', createdAt: ts, updatedAt: ts, ...values })
    .returning({ id: P.id })
  ids[name] = row.id
  if (details) await db.insert(schema.propertyDetails).values({ organizationId: orgId, propertyKind: 'developer', propertyId: row.id, createdAt: ts, updatedAt: ts, ...details })
  if (legal) await db.insert(schema.propertyLegalEconomics).values({ organizationId: orgId, propertyKind: 'developer', propertyId: row.id, createdAt: ts, updatedAt: ts, ...legal })
  return row.id as number
}

async function search(orgId: number, query: Record<string, unknown>): Promise<string[]> {
  const s = await buildPublicSearch(db, orgId, query)
  const rows = await db.select({ name: P.name }).from(P).where(and(...s.conds)).orderBy(...publicSearchOrder(s.sort))
  return rows.map((r: { name: string }) => r.name)
}

beforeAll(async () => {
  ;({ db } = createTestDb())
  ;[orgA, devA] = await org('a')
  ;[orgB, devB] = await org('b')

  await prop(orgA, devA, 'Piso Oviedo Centro', { propertyType: 'Apartment', price: 200_000, area: 100, city: 'Oviedo', community: 'Centro', postalCode: '33003', publishedAt: '2026-03-01 10:00:00', condition: 'good', hasTerrace: 1, street: 'Calle Uría' }, { province: 'Asturias', municipality: 'Oviedo', neighborhood: 'Centro', subtype: 'flat' })
  await prop(orgA, devA, 'Ático Gijón', { propertyType: 'Penthouse', price: 450_000, priceOld: 500_000, area: 150, city: 'GIJÓN', postalCode: '33201', publishedAt: '2026-05-01 10:00:00', isExclusive: 1, condition: 'new', locationPrivacy: 'approximate', street: 'Calle Corrida' }, { province: 'Asturias', municipality: 'Gijón', subtype: 'penthouse' })
  const casa = await prop(orgA, devA, 'Casa Avilés', { propertyType: 'House', price: 300_000, area: 0, city: 'Avilés', publishedAt: '2026-01-15 10:00:00', status: 'new' }, { province: 'Asturias', municipality: 'Avilés', subtype: 'detached', isRenovated: 1 })
  await db.insert(schema.priceHistory).values({ developerPropertyId: casa, price: 300_000, previousPrice: 400_000, recordedAt: '2026-02-01 00:00:00' })
  await prop(orgA, devA, 'Local Oviedo', { propertyType: 'Retail', price: 120_000, area: 50, city: 'oviedo', createdAt: '2026-02-01 00:00:00' }, { listingSituation: 'rented' })
  await prop(orgA, devA, 'Piso alquiler Oviedo', { propertyType: 'Apartment', transactionType: 'rent', price: 900, area: 70, city: 'Oviedo', furnished: 'yes', publishedAt: '2026-04-01 00:00:00' }, { rentalTerm: 'seasonal' })
  await prop(orgA, devA, 'Piso alquiler Gijón', { propertyType: 'Apartment', transactionType: 'rent', price: 750, area: 60, city: 'Gijón', publishedAt: '2026-04-02 00:00:00' }, undefined, { rentExpensesIncluded: 1 })
  await prop(orgA, devA, 'Sin precio', { propertyType: 'Apartment', price: null, area: 80, city: 'Oviedo', publishedAt: '2026-02-10 00:00:00' })
  await prop(orgA, devA, 'Borrado Oviedo', { propertyType: 'Apartment', price: 100_000, area: 50, city: 'Oviedo', deletedAt: '2026-06-01 00:00:00' })
  await prop(orgB, devB, 'Ajeno Oviedo', { propertyType: 'Apartment', price: 100_000, area: 50, city: 'Oviedo', publishedAt: '2026-06-01 00:00:00' })
  forgetLocationIndex()
})

describe('Property Search: base', () => {
  it('sólo la agencia del host y nada de la papelera', async () => {
    const all = await search(orgA, {})
    expect(all).not.toContain('Ajeno Oviedo')
    expect(all).not.toContain('Borrado Oviedo')
    expect(all).toHaveLength(7)
    expect(await search(orgB, {})).toEqual(['Ajeno Oviedo'])
  })

  it('Comprar y Alquilar no se mezclan', async () => {
    expect(await search(orgA, { operacion: 'alquiler' })).toEqual(expect.arrayContaining(['Piso alquiler Oviedo', 'Piso alquiler Gijón']))
    expect(await search(orgA, { operacion: 'alquiler' })).toHaveLength(2)
    expect(await search(orgA, { operacion: 'venta' })).not.toContain('Piso alquiler Oviedo')
  })
})

describe('Property Search: ubicación', () => {
  it('varias ubicaciones se unen, sin tildes ni mayúsculas, con todas sus formas guardadas', async () => {
    const r = await search(orgA, { operacion: 'venta', municipality: ['oviedo', 'gijon'] })
    expect(r.sort()).toEqual(['Local Oviedo', 'Piso Oviedo Centro', 'Sin precio', 'Ático Gijón'].sort())
    expect(r).not.toContain('Casa Avilés')
  })

  it('una ubicación que no existe en la agencia no devuelve nada (nunca «todo»)', async () => {
    expect(await search(orgA, { municipality: 'Madrid' })).toEqual([])
  })

  it('se combinan con los demás criterios y con provincia, barrio y código postal', async () => {
    expect(await search(orgA, { province: 'asturias', maxPrice: '250000', operacion: 'venta' })).toEqual(['Piso Oviedo Centro'])
    expect(await search(orgA, { neighborhood: 'centro' })).toEqual(['Piso Oviedo Centro'])
    expect(await search(orgA, { postalCode: '332' })).toEqual(['Ático Gijón'])
  })

  it('la calle sólo encuentra propiedades con ubicación exacta', async () => {
    expect(await search(orgA, { street: 'Calle Uría' })).toEqual(['Piso Oviedo Centro'])
    expect(await search(orgA, { street: 'Calle Corrida' })).toEqual([])
  })

  it('las sugerencias son reales, agrupadas y con contexto', async () => {
    const entries = await locationIndex(db, orgA)
    const gij = suggestLocations(entries, 'gij').filter((e) => e.kind === 'municipality')
    expect(gij).toHaveLength(1)
    expect(gij[0]!.variants.sort()).toEqual(['GIJÓN', 'Gijón'].sort())
    expect(gij[0]!.context).toBe('Asturias')
    const ovi = suggestLocations(entries, 'OVIE').find((e) => e.kind === 'municipality')!
    expect(ovi.value).toBe('Oviedo')
    expect(ovi.count).toBe(4)
    expect(suggestLocations(entries, 'madrid')).toEqual([])
    // Ni de otra agencia ni de la papelera, ni la calle de una con ubicación aproximada.
    expect(entries.some((e) => e.kind === 'street' && e.value === 'Calle Corrida')).toBe(false)
    const b = await locationIndex(db, orgB)
    expect(b.find((e) => e.kind === 'municipality')?.count).toBe(1)
  })

  it('una propiedad recién publicada se sugiere y se encuentra al momento (el índice en memoria no se queda atrás)', async () => {
    expect(suggestLocations(await locationIndex(db, orgA), 'llanes')).toEqual([])
    const id = await prop(orgA, devA, 'Casa Llanes', { propertyType: 'House', price: 250_000, area: 120, city: 'Llanes', updatedAt: '2026-06-01 00:00:00' })
    try {
      expect(suggestLocations(await locationIndex(db, orgA), 'llanes').map((e) => e.value)).toEqual(['Llanes'])
      expect(await search(orgA, { municipality: 'Llanes' })).toEqual(['Casa Llanes'])
    } finally {
      await db.delete(P).where(and(eq(P.id, id)))
    }
    expect(suggestLocations(await locationIndex(db, orgA), 'llanes')).toEqual([])
  })
})

describe('Property Search: tipo, estado, situación y alquiler', () => {
  it('tipos y subtipos a la vez: un subtipo acota su tipo', async () => {
    expect((await search(orgA, { type: 'Retail', subtype: 'penthouse' })).sort()).toEqual(['Local Oviedo', 'Ático Gijón'].sort())
    expect(await search(orgA, { type: 'Apartment', subtype: 'flat', operacion: 'venta' })).toEqual(['Piso Oviedo Centro'])
  })

  it('obra nueva / segunda mano y estado de conservación', async () => {
    expect(await search(orgA, { estado: 'obra_nueva' })).toEqual(['Casa Avilés'])
    expect(await search(orgA, { obra: 'nueva' })).toEqual(['Casa Avilés'])
    expect(await search(orgA, { estado: 'segunda_mano', operacion: 'venta' })).not.toContain('Casa Avilés')
    expect(await search(orgA, { estado: 'a_estrenar' })).toEqual(['Ático Gijón'])
    expect(await search(orgA, { estado: 'reformado' })).toEqual(['Casa Avilés'])
    expect(await search(orgA, { estado: ['buen_estado', 'a_estrenar'] })).toEqual(expect.arrayContaining(['Piso Oviedo Centro', 'Ático Gijón']))
  })

  it('situación anunciada y modalidad de alquiler (sin indicar = larga estancia)', async () => {
    expect(await search(orgA, { situacion: 'rented' })).toEqual(['Local Oviedo'])
    expect(await search(orgA, { operacion: 'alquiler', rentalTerm: 'seasonal' })).toEqual(['Piso alquiler Oviedo'])
    expect(await search(orgA, { operacion: 'alquiler', rentalTerm: 'long_term' })).toEqual(['Piso alquiler Gijón'])
    expect(await search(orgA, { operacion: 'alquiler', expensesIncluded: '1' })).toEqual(['Piso alquiler Gijón'])
    expect(await search(orgA, { furnished: 'yes' })).toEqual(['Piso alquiler Oviedo'])
    expect(await search(orgA, { terrace: '1' })).toEqual(['Piso Oviedo Centro'])
  })

  it('un rango al revés se interpreta bien y un valor no válido se ignora', async () => {
    expect(await search(orgA, { operacion: 'venta', minPrice: '250000', maxPrice: '150000' })).toEqual(['Piso Oviedo Centro'])
    expect((await search(orgA, { operacion: 'venta', minPrice: '-5', bedrooms: 'x' })).length).toBe(5)
  })
})

describe('Property Search: las ocho ordenaciones, en el servidor', () => {
  const venta = (sort: string) => search(orgA, { operacion: 'venta', sort })

  it('Baratos y Precio más alto: lo que no tiene precio, al final', async () => {
    expect(await venta('price_asc')).toEqual(['Local Oviedo', 'Piso Oviedo Centro', 'Casa Avilés', 'Ático Gijón', 'Sin precio'])
    expect(await venta('price_desc')).toEqual(['Ático Gijón', 'Casa Avilés', 'Piso Oviedo Centro', 'Local Oviedo', 'Sin precio'])
  })

  it('Recientes y Antiguos por la fecha real de publicación (sin ella, la de alta)', async () => {
    expect(await venta('newest')).toEqual(['Ático Gijón', 'Piso Oviedo Centro', 'Sin precio', 'Local Oviedo', 'Casa Avilés'])
    expect(await venta('oldest')).toEqual(['Casa Avilés', 'Local Oviedo', 'Sin precio', 'Piso Oviedo Centro', 'Ático Gijón'])
  })

  it('Han bajado más: por porcentaje real; las que no han bajado, detrás', async () => {
    const r = await venta('price_drop')
    // Casa: 400k → 300k (25 %), del historial. Ático: 500k → 450k (10 %), del precio anterior.
    expect(r.slice(0, 2)).toEqual(['Casa Avilés', 'Ático Gijón'])
    expect(r.slice(2).sort()).toEqual(['Local Oviedo', 'Piso Oviedo Centro', 'Sin precio'].sort())
  })

  it('€/m² con el mismo cálculo que la ficha, sin dividir entre cero', async () => {
    expect(await venta('ppm2_asc')).toEqual(['Piso Oviedo Centro', 'Local Oviedo', 'Ático Gijón', 'Sin precio', 'Casa Avilés'])
    expect(await venta('ppm2_desc')).toEqual(['Ático Gijón', 'Local Oviedo', 'Piso Oviedo Centro', 'Sin precio', 'Casa Avilés'])
    expect(pricePerSquareMeter(200_000, 100)).toBe(2000)
    expect(pricePerSquareMeter(300_000, 0)).toBeNull()
  })

  it('Relevancia: exclusivas primero y después las publicadas más recientemente', async () => {
    expect(await venta('')).toEqual(['Ático Gijón', 'Piso Oviedo Centro', 'Sin precio', 'Local Oviedo', 'Casa Avilés'])
    expect(await venta('no-existe')).toEqual(await venta(''))
  })

  it('el orden es estable: paginar no repite ni salta ninguna', async () => {
    const s = await buildPublicSearch(db, orgA, { sort: 'price_asc' })
    const page = (n: number) => db.select({ id: P.id }).from(P).where(and(...s.conds)).orderBy(...publicSearchOrder(s.sort)).limit(3).offset(n * 3)
    const seen = [...(await page(0)), ...(await page(1)), ...(await page(2))].map((r: { id: number }) => r.id)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toHaveLength(7)
  })
})

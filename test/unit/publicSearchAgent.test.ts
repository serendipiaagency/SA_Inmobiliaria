import { beforeAll, describe, expect, it } from 'vitest'
import { and } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { createTestDb } from './helpers/tenantFixtures'
import { buildPublicSearchFor } from '../../server/utils/properties/publicSearch'

/**
 * El MISMO buscador público sobre el catálogo de 2ª mano (agent_properties):
 * los filtros, el eje obra-nueva/2ª-mano, la exclusión de lo vendido y las
 * ordenaciones, contra SQLite real con todas las migraciones. El catálogo de
 * obra nueva (byte-idéntico al anterior) lo cubre publicSearch.test.ts.
 */

const A = schema.agentProperties
const agent = buildPublicSearchFor('agent')
let db: any
let orgA = 0
let orgB = 0
const ids: Record<string, number> = {}

async function org(name: string) {
  const [o] = await db.insert(schema.organizations).values({ name, slug: `psa-${name}`, status: 'active', createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00' }).returning({ id: schema.organizations.id })
  return o.id as number
}

async function prop(orgId: number, name: string, values: Record<string, unknown>, details?: Record<string, unknown>) {
  const ts = '2026-01-01 00:00:00'
  const [row] = await db
    .insert(A)
    .values({ organizationId: orgId, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'available', createdAt: ts, updatedAt: ts, ...values })
    .returning({ id: A.id })
  ids[name] = row.id
  if (details) await db.insert(schema.propertyDetails).values({ organizationId: orgId, propertyKind: 'agent', propertyId: row.id, createdAt: ts, updatedAt: ts, ...details })
  return row.id as number
}

async function search(orgId: number, query: Record<string, unknown>): Promise<string[]> {
  const s = await agent.buildConds(db, orgId, query)
  const rows = await db.select({ name: A.name }).from(A).where(and(...s.conds)).orderBy(...agent.order(s.sort))
  return rows.map((r: { name: string }) => r.name)
}

beforeAll(async () => {
  ;({ db } = createTestDb())
  orgA = await org('a')
  orgB = await org('b')

  await prop(orgA, 'Piso 2M Oviedo', { propertyType: 'Apartment', price: 180_000, area: 90, city: 'Oviedo', community: 'Centro', postalCode: '33003', publishedAt: '2026-03-01 10:00:00', condition: 'good', hasTerrace: 1, bedrooms: 3 }, { municipality: 'Oviedo', neighborhood: 'Centro' })
  await prop(orgA, 'Casa 2M Gijon', { propertyType: 'House', price: 420_000, priceOld: 480_000, area: 160, city: 'Gijón', publishedAt: '2026-05-01 10:00:00', isExclusive: 1, condition: 'new', bedrooms: 5 })
  await prop(orgA, 'Local 2M alquiler', { propertyType: 'Retail', transactionType: 'rent', price: 1_200, area: 80, city: 'Oviedo', publishedAt: '2026-04-01 10:00:00' })
  await prop(orgA, 'Piso 2M vendido', { propertyType: 'Apartment', price: 150_000, area: 70, city: 'Oviedo', status: 'sold', publishedAt: '2026-02-01 10:00:00' })
  await prop(orgA, 'Piso 2M borrado', { propertyType: 'Apartment', price: 90_000, area: 60, city: 'Oviedo', deletedAt: '2026-06-01 00:00:00' })
  await prop(orgB, 'Ajeno 2M', { propertyType: 'Apartment', price: 100_000, area: 50, city: 'Oviedo', publishedAt: '2026-06-01 10:00:00' })
})

describe('Buscador público de 2ª mano: base', () => {
  it('sólo la agencia del host, nada de la papelera y nada vendido', async () => {
    const all = await search(orgA, {})
    expect(all).toEqual(expect.arrayContaining(['Piso 2M Oviedo', 'Casa 2M Gijon', 'Local 2M alquiler']))
    expect(all).not.toContain('Piso 2M vendido')
    expect(all).not.toContain('Piso 2M borrado')
    expect(all).not.toContain('Ajeno 2M')
    expect(all).toHaveLength(3)
    expect(await search(orgB, {})).toEqual(['Ajeno 2M'])
  })

  it('comprar y alquilar no se mezclan', async () => {
    expect(await search(orgA, { operacion: 'alquiler' })).toEqual(['Local 2M alquiler'])
    expect(await search(orgA, { operacion: 'venta' })).not.toContain('Local 2M alquiler')
  })
})

describe('Buscador público de 2ª mano: filtros y eje de estado', () => {
  it('toda la 2ª mano es «segunda mano»; «obra nueva» no devuelve ninguna', async () => {
    expect(await search(orgA, { estado: 'obra_nueva' })).toEqual([])
    expect((await search(orgA, { estado: 'segunda_mano', operacion: 'venta' })).sort()).toEqual(['Casa 2M Gijon', 'Piso 2M Oviedo'].sort())
  })

  it('precio, superficie, habitaciones, tipo, ubicación y características', async () => {
    expect(await search(orgA, { operacion: 'venta', maxPrice: '200000' })).toEqual(['Piso 2M Oviedo'])
    expect(await search(orgA, { bedrooms: '4' })).toEqual(['Casa 2M Gijon'])
    expect(await search(orgA, { type: 'House' })).toEqual(['Casa 2M Gijon'])
    expect(await search(orgA, { municipality: 'oviedo', operacion: 'venta' })).toEqual(['Piso 2M Oviedo'])
    expect(await search(orgA, { terrace: '1' })).toEqual(['Piso 2M Oviedo'])
    expect(await search(orgA, { neighborhood: 'centro' })).toEqual(['Piso 2M Oviedo'])
  })

  it('el filtro de promotor (sólo obra nueva) se ignora sin romper', async () => {
    expect((await search(orgA, { developerId: '7', operacion: 'venta' })).sort()).toEqual(['Casa 2M Gijon', 'Piso 2M Oviedo'].sort())
  })
})

describe('Buscador público de 2ª mano: ordenaciones', () => {
  const venta = (sort: string) => search(orgA, { operacion: 'venta', sort })

  it('precio ascendente y descendente', async () => {
    expect(await venta('price_asc')).toEqual(['Piso 2M Oviedo', 'Casa 2M Gijon'])
    expect(await venta('price_desc')).toEqual(['Casa 2M Gijon', 'Piso 2M Oviedo'])
  })

  it('«Han bajado más» usa sólo el precio anterior (no hay historial en 2ª mano)', async () => {
    // Casa: 480k → 420k (12,5 %), del precio anterior. Piso: sin precio anterior, detrás.
    expect(await venta('price_drop')).toEqual(['Casa 2M Gijon', 'Piso 2M Oviedo'])
  })

  it('relevancia: exclusivas primero', async () => {
    expect(await venta('')).toEqual(['Casa 2M Gijon', 'Piso 2M Oviedo'])
  })
})

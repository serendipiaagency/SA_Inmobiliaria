import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cierre del núcleo: el matching no ofrece a ningún comprador una propiedad
 * cuyo estado comercial común (`property_details.commercial_status`) es
 * vendida, alquilada, retirada o borrador, aunque la disponibilidad de su
 * catálogo siga «disponible» (una 2ª mano retirada, o una obra nueva, que no
 * tiene «vendida»). «Reservada» sí sigue siendo candidata.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
const ev = (db: any) => ({ context: { db } }) as any
let seq = 0

async function flat(db: any, orgId: number, commercialStatus: string | null) {
  seq += 1
  const [row] = await db
    .insert(schema.agentProperties)
    .values({ organizationId: orgId, slug: `estado-${seq}`, transactionType: 'sale', propertyType: 'Apartment', price: 400_000, status: 'available', city: 'Madrid', createdAt: ts, updatedAt: ts })
    .returning()
  if (commercialStatus) {
    await db.insert(schema.propertyDetails).values({ organizationId: orgId, propertyKind: 'agent', propertyId: row.id, commercialStatus, createdAt: ts, updatedAt: ts })
  }
  return row.id as number
}

describe('Matching y estado comercial común', () => {
  it('sólo ofrece lo disponible, lo reservado y lo que no tiene estado comercial indicado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'EstadoComercial')
    const ids = {
      sinIndicar: await flat(db, a.orgId, null),
      disponible: await flat(db, a.orgId, 'available'),
      reservada: await flat(db, a.orgId, 'reserved'),
      vendida: await flat(db, a.orgId, 'sold'),
      alquilada: await flat(db, a.orgId, 'rented'),
      retirada: await flat(db, a.orgId, 'withdrawn'),
      borrador: await flat(db, a.orgId, 'draft'),
    }
    const { findPropertiesForCriteria } = await import('../../server/utils/matching/service')
    const res = await findPropertiesForCriteria(ev(db), a.orgId, { operation: 'sale', propertyTypes: ['Apartment'], priceMax: 500_000 }, { includeIneligible: true, limit: 100 })
    const found = new Set(res.results.filter((r) => r.propertyKind === 'agent').map((r) => Number(r.property.id)))
    expect(found.has(ids.sinIndicar)).toBe(true)
    expect(found.has(ids.disponible)).toBe(true)
    expect(found.has(ids.reservada)).toBe(true)
    for (const id of [ids.vendida, ids.alquilada, ids.retirada, ids.borrador]) expect(found.has(id)).toBe(false)
  })
})

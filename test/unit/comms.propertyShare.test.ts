import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { buildPropertyShare } from '../../server/utils/comms/admin'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 29 §124/§143 — buildPropertyShare() de los dos catálogos. 2ª mano
 * (agent_properties) no tiene página pública (sin publishedAt, ver
 * auditoría FASE 26/28): nunca inventa un enlace a una página que no
 * existe. Los dos reutilizan toPublicProperty() — el mismo filtro que ya
 * protege la ficha pública — así que nunca sale un campo estrictamente
 * interno (§125: "nunca minimumAuthorizedPrice, comisiones, notas
 * internas...").
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
const origin = 'https://agencia.example.com'

describe('buildPropertyShare — FASE 29 §124/§143', () => {
  it('developer-properties: incluye enlace público real, portada y ficha resumida', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ShareDeveloper')
    await db.update(schema.developerProperties).set({ name: 'Torre Sol', slug: 'torre-sol', price: 500000, community: 'Costa Azul', coverImage: 'uploads/torre.jpg', bedrooms: 3, area: 110 }).where(eq(schema.developerProperties.id, fixture.projectId))

    const share = await buildPropertyShare(db, fixture.orgId, fixture.projectId, 'developer', origin)
    expect(share.kind).toBe('developer')
    expect(share.url).toBe(`${origin}/propiedades/torre-sol`)
    expect(share.imageLink).toBe(`${origin}/api/media/uploads/torre.jpg`)
    expect(share.text).toContain('Torre Sol')
    expect(share.text).toContain('Costa Azul')
    expect(share.text).toContain(share.url)
  })

  it('agent-properties (2ª mano): sin enlace público — nunca inventa una página que no existe', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ShareAgent')
    const [agentProperty] = await db
      .insert(schema.agentProperties)
      .values({ organizationId: fixture.orgId, slug: `share-agent-${Date.now()}`, price: 220000, city: 'Marbella', street: 'Calle Sol 5', mainImage: 'uploads/piso.jpg', bedrooms: 2, area: 75, status: 'available', createdAt: ts, updatedAt: ts })
      .returning()

    const share = await buildPropertyShare(db, fixture.orgId, agentProperty.id, 'agent', origin)
    expect(share.kind).toBe('agent')
    expect(share.url).toBeNull()
    expect(share.imageLink).toBe(`${origin}/api/media/uploads/piso.jpg`)
    expect(share.text).toContain('Calle Sol 5')
    expect(share.text).toContain('Marbella')
    expect(share.text).not.toContain('http')
  })

  it('agent-properties: la nota se incluye, y el precio se formatea igual que developer', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'ShareAgentNote')
    // Una agencia que trabaja en euros (Configuración → Moneda): el precio sale en su moneda (utils/currency.ts).
    await db.insert(schema.settings).values({ key: `org:${fixture.orgId}:currency`, value: 'EUR', updatedAt: ts })
    const [agentProperty] = await db
      .insert(schema.agentProperties)
      .values({ organizationId: fixture.orgId, slug: `share-agent-note-${Date.now()}`, price: 180000, city: 'Málaga', street: 'Avenida Sur 2', status: 'available', createdAt: ts, updatedAt: ts })
      .returning()

    const share = await buildPropertyShare(db, fixture.orgId, agentProperty.id, 'agent', origin, 'Te paso la que comentamos')
    expect(share.text).toContain('180.000 €')
    expect(share.text).toContain('Te paso la que comentamos')
  })

  it('una propiedad de otra organización no se encuentra, sin importar el catálogo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'ShareTenantA')
    const b = await seedTenant(db, 'ShareTenantB')
    await expect(buildPropertyShare(db, b.orgId, a.projectId, 'developer', origin)).rejects.toMatchObject({ statusCode: 404 })
    await expect(buildPropertyShare(db, b.orgId, a.propertyId, 'agent', origin)).rejects.toMatchObject({ statusCode: 404 })
  })
})

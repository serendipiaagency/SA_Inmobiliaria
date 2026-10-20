import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { ownCommercialScope } from '../../server/utils/dashboard/commercial'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Cola 12-C: un comercial vinculado a su ficha sólo ve lo suyo en los
 * listados de CRM (leads, visitas, tareas). `ownCommercialScope` es la regla
 * que lo decide (la misma del dashboard): devuelve el id del comercial al que
 * acotar, o `null` (ve toda la agencia).
 */
const ts = '2026-05-10 10:00:00'
const COMERCIAL = JSON.stringify(['general:read', 'crm:write', 'web:read', 'inbox:read'])
let db: any
let a: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'OwnScope')
})

async function user(over: Record<string, any>) {
  const [u] = await db
    .insert(schema.users)
    .values({ organizationId: a.orgId, name: over.name || 'U', email: over.email || `u-${Math.random().toString(36).slice(2)}@x.test`, password: 'x', role: 'user', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return u
}

async function member(name: string, userId: number | null) {
  const [m] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: a.orgId, name, slug: name.toLowerCase(), email: `${name.toLowerCase()}@x.test`, position: 'Comercial', employmentStatus: 'active', userId, createdAt: ts, updatedAt: ts })
    .returning()
  return m
}

describe('ownCommercialScope', () => {
  it('un comercial restringido y VINCULADO a su ficha se acota a su comercial', async () => {
    const u = await user({ permissions: COMERCIAL })
    const m = await member('Ana', u.id)
    expect(await ownCommercialScope(db, a.orgId, { id: u.id, role: 'user', permissions: u.permissions })).toBe(m.id)
  })

  it('el administrador de la agencia (sin restricciones) ve toda la agencia', async () => {
    const admin = await user({ role: 'admin', permissions: null })
    expect(await ownCommercialScope(db, a.orgId, { id: admin.id, role: 'admin', permissions: null })).toBeNull()
  })

  it('el super_admin ve toda la agencia', async () => {
    expect(await ownCommercialScope(db, a.orgId, { id: 1, role: 'super_admin', permissions: null })).toBeNull()
  })

  it('un gerente (restringido pero con system:write) ve toda la agencia', async () => {
    const u = await user({ permissions: JSON.stringify(['crm:write', 'system:write']) })
    await member('Gerente', u.id)
    expect(await ownCommercialScope(db, a.orgId, { id: u.id, role: 'user', permissions: u.permissions })).toBeNull()
  })

  it('una cuenta restringida SIN ficha de comercial ve toda la agencia (concesión explícita, no un comercial)', async () => {
    const u = await user({ permissions: COMERCIAL })
    expect(await ownCommercialScope(db, a.orgId, { id: u.id, role: 'user', permissions: u.permissions })).toBeNull()
  })

  it('cada comercial se acota al SUYO, no al de otro', async () => {
    const ua = await user({ permissions: COMERCIAL })
    const ub = await user({ permissions: COMERCIAL })
    const ma = await member('Ana', ua.id)
    const mb = await member('Beto', ub.id)
    expect(await ownCommercialScope(db, a.orgId, { id: ua.id, role: 'user', permissions: ua.permissions })).toBe(ma.id)
    expect(await ownCommercialScope(db, a.orgId, { id: ub.id, role: 'user', permissions: ub.permissions })).toBe(mb.id)
    expect(ma.id).not.toBe(mb.id)
  })
})

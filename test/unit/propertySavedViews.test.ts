import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { savedViewVisibilityCond, assertOwnsSavedView } from '../../server/utils/properties/savedViews'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 27 (incremento 2) — Saved Filter / Saved View / Shared View
 * (migración 0080). Antes de esto ningún filtro se podía guardar ni
 * compartir; §75-76 exige que compartir amplíe quién LEE, nunca quién
 * puede tocarla — probado aquí contra la tabla real, no reimplementado en
 * memoria (mismo criterio que el resto de la suite: `createTestDb()`
 * aplica las migraciones reales sobre SQLite en memoria).
 */

const ts = '2026-01-01 00:00:00'

async function seedSecondUser(db: any, orgId: number, name: string) {
  const [row] = await db
    .insert(schema.users)
    .values({ organizationId: orgId, name, email: `${name.toLowerCase()}@example.com`, password: 'x', role: 'admin', createdAt: ts, updatedAt: ts })
    .returning({ id: schema.users.id })
  return row.id as number
}

describe('savedViewVisibilityCond — quién LEE un filtro/vista guardada', () => {
  it('cada usuario ve las suyas (privadas o no) más las que cualquiera compartió, nunca las privadas de otro', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SavedViewsOrg')
    const userA = fixture.userId
    const userB = await seedSecondUser(db, fixture.orgId, 'SavedViewsUserB')

    await db.insert(schema.propertySavedViews).values([
      { organizationId: fixture.orgId, userId: userA, resource: 'properties', kind: 'filter', name: 'Mía privada (A)', visibility: 'private', queryJson: '{}', createdAt: ts, updatedAt: ts },
      { organizationId: fixture.orgId, userId: userB, resource: 'properties', kind: 'filter', name: 'Privada de B', visibility: 'private', queryJson: '{}', createdAt: ts, updatedAt: ts },
      { organizationId: fixture.orgId, userId: userB, resource: 'properties', kind: 'view', name: 'Compartida por B', visibility: 'shared', queryJson: '{}', createdAt: ts, updatedAt: ts },
    ])

    const visibleToA = await db
      .select({ name: schema.propertySavedViews.name })
      .from(schema.propertySavedViews)
      .where(and(eq(schema.propertySavedViews.organizationId, fixture.orgId), savedViewVisibilityCond(userA)))
    const namesForA = visibleToA.map((r: any) => r.name).sort()
    expect(namesForA).toEqual(['Compartida por B', 'Mía privada (A)'])
    expect(namesForA).not.toContain('Privada de B')
  })

  it('otra organización, aunque comparta, nunca aparece — la visibilidad no sustituye al aislamiento por tenant', async () => {
    const { db } = createTestDb()
    const orgA = await seedTenant(db, 'SavedViewsTenantA')
    const orgB = await seedTenant(db, 'SavedViewsTenantB')

    await db.insert(schema.propertySavedViews).values({
      organizationId: orgB.orgId,
      userId: orgB.userId,
      resource: 'properties',
      kind: 'filter',
      name: 'Compartida en la otra organización',
      visibility: 'shared',
      queryJson: '{}',
      createdAt: ts,
      updatedAt: ts,
    })

    const visibleFromOrgA = await db
      .select({ name: schema.propertySavedViews.name })
      .from(schema.propertySavedViews)
      .where(and(eq(schema.propertySavedViews.organizationId, orgA.orgId), savedViewVisibilityCond(orgA.userId)))
    expect(visibleFromOrgA).toEqual([])
  })
})

describe('assertOwnsSavedView — quién puede EDITAR o BORRAR', () => {
  it('deja pasar al creador', () => {
    expect(() => assertOwnsSavedView({ userId: 7 }, 7)).not.toThrow()
  })

  it('rechaza a cualquier otro con 403, aunque la fila sea compartida — compartir no transfiere la propiedad', () => {
    try {
      assertOwnsSavedView({ userId: 7 }, 8)
      expect.unreachable('debía lanzar')
    } catch (err: any) {
      expect(err.statusCode).toBe(403)
    }
  })
})

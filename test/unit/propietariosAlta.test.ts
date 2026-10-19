import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '../../server/db/schema'
import { adminResources } from '../../server/utils/adminResources'
import { insertResourceRecord } from '../../server/utils/adminResourceCreate'
import { validateInitialOwners } from '../../server/utils/contacts/crm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

const read = (f: string) => readFileSync(join(import.meta.dirname, '../..', f), 'utf8')
const ts = '2026-01-01 00:00:00'

async function contact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row.id as number
}

async function setup() {
  const { db } = createTestDb()
  const a = await seedTenant(db, 'OwnA')
  const b = await seedTenant(db, 'OwnB')
  const ctx = (t: any) => ({ orgId: t.orgId, user: { id: t.userId, role: 'admin' } as any })
  const create = (resource: 'properties' | 'developer-properties', t: any, body: Record<string, any>) =>
    insertResourceRecord(db, resource, adminResources[resource]!, resource === 'developer-properties' ? { developerId: t.developerId, ...body } : body, ctx(t))
  const links = async (kind: string, id: number) => db.select().from(schema.propertyContacts).where(eq(schema.propertyContacts.propertyId, id)).then((r: any[]) => r.filter((x) => x.propertyKind === kind))
  return { db, a, b, create, links }
}

describe('propietarios antes del primer guardado — servidor', () => {
  it('2ª mano: el alta con propietarios los persiste con la propiedad, con su % y el rol «Propietario» en el CRM', async () => {
    const { db, a, create, links } = await setup()
    const c1 = await contact(db, a.orgId, 'Marta')
    const c2 = await contact(db, a.orgId, 'Luis')
    const r = await create('properties', a, { name: 'Piso con dueños', owners: [{ contactId: c1, role: 'owner', ownershipPct: 60, isPrimary: 1 }, { contactId: c2, role: 'co_owner', ownershipPct: 40 }] })
    const rows = await links('agent', r.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((x: any) => x.contactId === c1)).toMatchObject({ role: 'owner', ownershipPct: 60, isPrimary: 1, organizationId: a.orgId, createdBy: a.userId })
    const roles = await db.select().from(schema.contactRoles).where(eq(schema.contactRoles.contactId, c1))
    expect(roles.map((x: any) => x.role)).toContain('owner')
  })
  it('web: igual en Propiedades (web)', async () => {
    const { db, a, create, links } = await setup()
    const c1 = await contact(db, a.orgId, 'Ana')
    const r = await create('developer-properties', a, { name: 'Torre con dueña', owners: [{ contactId: c1, role: 'owner', ownershipPct: 100 }] })
    expect(await links('developer', r.id)).toHaveLength(1)
  })
  it('sin propietarios, el alta funciona como siempre', async () => {
    const { a, create, links } = await setup()
    const r = await create('properties', a, { name: 'Sin dueños' })
    expect(await links('agent', r.id)).toHaveLength(0)
  })
  it('un propietario inválido rechaza el alta ENTERA: no queda ninguna propiedad a medias', async () => {
    const { db, a, create } = await setup()
    const c1 = await contact(db, a.orgId, 'Pepe')
    const before = (await db.select().from(schema.agentProperties)).length
    await expect(create('properties', a, { name: 'Rota', owners: [{ contactId: c1, role: 'owner', ownershipPct: 70 }, { contactId: c1, role: 'co_owner', ownershipPct: 50 }] })).rejects.toMatchObject({ statusCode: 422 })
    expect((await db.select().from(schema.agentProperties)).length).toBe(before)
  })
  it('un contacto de OTRA agencia no se puede vincular (aislamiento multiempresa)', async () => {
    const { db, a, b, create } = await setup()
    const ajeno = await contact(db, b.orgId, 'De la otra agencia')
    const before = (await db.select().from(schema.agentProperties)).length
    await expect(create('properties', a, { name: 'Intento', owners: [{ contactId: ajeno, role: 'owner' }] })).rejects.toBeTruthy()
    expect((await db.select().from(schema.agentProperties)).length).toBe(before)
  })
  it('dos principales en la lista rechazan el alta entera sin dejar la propiedad', async () => {
    const { db, a, create } = await setup()
    const c1 = await contact(db, a.orgId, 'Eva')
    const before = (await db.select().from(schema.agentProperties)).length
    await expect(create('properties', a, { name: 'Dos principales', owners: [{ contactId: c1, role: 'owner', ownershipPct: 50, isPrimary: 1 }, { contactId: c1, role: 'contact', isPrimary: 1 }] })).rejects.toMatchObject({ statusCode: 422 })
    expect((await db.select().from(schema.agentProperties)).length).toBe(before)
  })
})

describe('validateInitialOwners', () => {
  it('reglas: formato, máximo, papel, % sólo de propietarios, suma ≤ 100, duplicados y un solo principal', async () => {
    const { db, a } = await setup()
    const c = await contact(db, a.orgId, 'X')
    const d = await contact(db, a.orgId, 'Y')
    expect(await validateInitialOwners(db, a.orgId, undefined)).toEqual([])
    await expect(validateInitialOwners(db, a.orgId, 'no')).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, Array.from({ length: 21 }, () => ({ contactId: c, role: 'owner' })))).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'dios' }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'tenant', ownershipPct: 10 }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'owner', ownershipPct: 101 }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'owner', ownershipPct: 60 }, { contactId: d, role: 'owner', ownershipPct: 50 }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'owner' }, { contactId: c, role: 'owner' }])).rejects.toMatchObject({ statusCode: 409 })
    await expect(validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'owner', isPrimary: 1 }, { contactId: d, role: 'owner', isPrimary: 1 }])).rejects.toMatchObject({ statusCode: 422 })
    expect(await validateInitialOwners(db, a.orgId, [{ contactId: c, role: 'owner', ownershipPct: 50 }, { contactId: d, role: 'co_owner', ownershipPct: 50 }])).toHaveLength(2)
  })
})

describe('propietarios antes del primer guardado — editor', () => {
  const manager = read('components/property-builder/PropertyContactsManager.vue')
  const builder = read('components/property-builder/PropertyBuilder.vue')
  it('el gestor ya no pide «Guarda la propiedad primero»: trabaja con la lista pendiente', () => {
    expect(manager).not.toContain('Guarda la propiedad primero')
    expect(manager).toContain('property-contacts-pending-note')
    expect(manager).toContain("emit('update:pending'")
  })
  it('el alta manda los propietarios con la propiedad, en la misma petición', () => {
    expect(builder).toMatch(/method: 'POST',\s+body: \{ \.\.\.requestBody\(\), owners:/)
    expect(builder).toContain(':pending="pendingOwners"')
  })
})

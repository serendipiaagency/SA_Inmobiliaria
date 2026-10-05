import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import {
  contactInputFromBody,
  createContactFromAdmin,
  ensureContactRole,
  listContactProperties,
  listContactRoles,
  listPropertyContacts,
  normalizeRoles,
  syncContactRoles,
  updateContactFromAdmin,
  validateNotePayload,
  validatePropertyContact,
} from '../../server/utils/contacts/crm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * CRM 360 del contacto (núcleo inmobiliario, FASES 8-9, migración 0086):
 * edición con deduplicación, roles múltiples, propietarios de una propiedad
 * con % y notas sobre cualquier entidad — siempre dentro de la organización.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))

const ts = '2026-01-01 00:00:00'
const ev = (db: any) => ({ context: { db } }) as any
const user = (id: number) => ({ id, role: 'admin' }) as any

async function contact(db: any, orgId: number, over: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.contacts)
    .values({ organizationId: orgId, name: 'Ana Pérez', email: `ana-${Math.random()}@x.test`, normalizedEmail: null, status: 'active', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}

describe('cabecera del contacto: validación', () => {
  it('normaliza y valida los campos que llegan (y sólo esos)', () => {
    expect(contactInputFromBody({ name: '  Ana  ', country: ' España ', source: 'portal', nextActionType: 'call', nextActionAt: '2026-11-01T10:30' })).toEqual({
      name: 'Ana',
      country: 'España',
      source: 'portal',
      nextActionType: 'call',
      nextActionAt: '2026-11-01 10:30',
    })
    expect(contactInputFromBody({ officeId: '' })).toEqual({ officeId: null })
  })

  it('rechaza valores fuera de catálogo, emails mal formados y nombres vacíos', () => {
    expect(() => contactInputFromBody({ name: '  ' })).toThrow(/nombre/)
    expect(() => contactInputFromBody({ email: 'no-es-email' })).toThrow(/email/)
    expect(() => contactInputFromBody({ source: 'paloma mensajera' })).toThrow(/Origen/)
    expect(() => contactInputFromBody({ nextActionType: 'telepatía' })).toThrow(/próxima acción/)
    expect(() => contactInputFromBody({ nextActionAt: 'mañana' })).toThrow(/Fecha/)
    expect(() => contactInputFromBody({ status: 'borrado' })).toThrow(/Estado/)
  })

  it('roles: sólo los del catálogo, sin repetir', () => {
    expect(normalizeRoles(['buyer', 'owner', 'buyer'])).toEqual(['buyer', 'owner'])
    expect(() => normalizeRoles(['buyer', 'alcalde'])).toThrow(/Rol no válido/)
    expect(() => normalizeRoles('buyer')).toThrow(/lista/)
  })
})

describe('roles múltiples (contact_roles)', () => {
  it('sincroniza exactamente los roles marcados y ensureContactRole nunca quita ninguno', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'RolesA')
    const c = await contact(db, A.orgId)
    expect(await syncContactRoles(db, A.orgId, c.id, ['buyer', 'investor'], A.userId)).toEqual(['buyer', 'investor'])
    expect(await syncContactRoles(db, A.orgId, c.id, ['investor', 'landlord'], A.userId)).toEqual(['landlord', 'investor'])
    await ensureContactRole(db, A.orgId, c.id, 'owner', A.userId)
    await ensureContactRole(db, A.orgId, c.id, 'owner', A.userId)
    expect(await listContactRoles(db, A.orgId, c.id)).toEqual(['owner', 'landlord', 'investor'])
  })
})

describe('alta y edición desde el panel', () => {
  it('edita la cabecera y los roles; un email que ya es de otra persona es un 409 salvo force', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'EditA')
    const created = await createContactFromAdmin(ev(db), A.orgId, user(A.userId), { name: 'Luis', phone: '+34600111222', roles: ['seller'] })
    const other = await createContactFromAdmin(ev(db), A.orgId, user(A.userId), { name: 'Marta', email: 'marta@x.test' })

    const res = await updateContactFromAdmin(ev(db), A.orgId, user(A.userId), created.id, { country: 'Francia', language: 'fr', nextActionType: 'visit', roles: ['seller', 'owner'] })
    expect(res.contact).toMatchObject({ country: 'Francia', language: 'fr', nextActionType: 'visit' })
    expect(res.roles).toEqual(['seller', 'owner'])

    await expect(updateContactFromAdmin(ev(db), A.orgId, user(A.userId), created.id, { email: 'MARTA@x.test' })).rejects.toMatchObject({ statusCode: 409 })
    const forced = await updateContactFromAdmin(ev(db), A.orgId, user(A.userId), created.id, { email: 'marta@x.test', force: true })
    expect(forced.contact.normalizedEmail).toBe('marta@x.test')
    expect(other.id).not.toBe(created.id)
  })

  it('no edita un contacto de otra agencia ni le asigna una oficina ajena', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'EditIsoA')
    const B = await seedTenant(db, 'EditIsoB')
    const cB = await contact(db, B.orgId)
    await expect(updateContactFromAdmin(ev(db), A.orgId, user(A.userId), cB.id, { country: 'X' })).rejects.toMatchObject({ statusCode: 404 })
    const [officeB] = await db.insert(schema.offices).values({ organizationId: B.orgId, name: 'B', createdAt: ts, updatedAt: ts }).returning()
    const cA = await contact(db, A.orgId)
    await expect(updateContactFromAdmin(ev(db), A.orgId, user(A.userId), cA.id, { officeId: officeB.id })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('propietarios y contactos de una propiedad (property_contacts)', () => {
  it('valida propiedad, contacto, papel y que la suma de propietarios no pase del 100 %', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'OwnersA')
    const ana = await contact(db, A.orgId, { name: 'Ana' })
    const luis = await contact(db, A.orgId, { name: 'Luis' })
    const base = { propertyKind: 'agent', propertyId: A.propertyId }

    await validatePropertyContact(db, A.orgId, { ...base, contactId: ana.id, role: 'owner', ownershipPct: 60 }, null)
    await db.insert(schema.propertyContacts).values({ organizationId: A.orgId, ...base, contactId: ana.id, role: 'owner', ownershipPct: 60, createdAt: ts, updatedAt: ts })

    await expect(validatePropertyContact(db, A.orgId, { ...base, contactId: luis.id, role: 'co_owner', ownershipPct: 50 }, null)).rejects.toThrow(/100 %/)
    await validatePropertyContact(db, A.orgId, { ...base, contactId: luis.id, role: 'co_owner', ownershipPct: 40 }, null)
    // Un inquilino no tiene % de propiedad.
    await expect(validatePropertyContact(db, A.orgId, { ...base, contactId: luis.id, role: 'tenant', ownershipPct: 10 }, null)).rejects.toThrow(/propietario o copropietario/)
    // La misma persona con el mismo papel dos veces: 409.
    await expect(validatePropertyContact(db, A.orgId, { ...base, contactId: ana.id, role: 'owner' }, null)).rejects.toMatchObject({ statusCode: 409 })
    await expect(validatePropertyContact(db, A.orgId, { ...base, contactId: ana.id, role: 'alcalde' }, null)).rejects.toThrow(/Papel/)
    await expect(validatePropertyContact(db, A.orgId, { propertyKind: 'otro', propertyId: 1, contactId: ana.id, role: 'owner' }, null)).rejects.toThrow(/propertyKind/)
  })

  it('no vincula a nadie nuevo a una propiedad de la papelera, pero el vínculo que ya existía se puede editar', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'OwnersTrash')
    const ana = await contact(db, A.orgId, { name: 'Ana' })
    const luis = await contact(db, A.orgId, { name: 'Luis' })
    const base = { propertyKind: 'agent', propertyId: A.propertyId }
    const [link] = await db.insert(schema.propertyContacts).values({ organizationId: A.orgId, ...base, contactId: ana.id, role: 'owner', ownershipPct: 50, createdAt: ts, updatedAt: ts }).returning()
    await db.update(schema.agentProperties).set({ deletedAt: ts }).where(eq(schema.agentProperties.id, A.propertyId))

    await expect(validatePropertyContact(db, A.orgId, { ...base, contactId: luis.id, role: 'co_owner', ownershipPct: 50 }, null)).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringMatching(/papelera/) })
    await expect(validatePropertyContact(db, A.orgId, { ownershipPct: 60 }, link)).resolves.toBeUndefined()
    // Y en «Propiedades» del contacto sigue apareciendo, marcada como borrada.
    const props = await listContactProperties(db, A.orgId, ana.id)
    expect(props[0].property.deletedAt).toBe(ts)
  })

  it('nunca vincula la propiedad o el contacto de otra agencia', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'OwnersIsoA')
    const B = await seedTenant(db, 'OwnersIsoB')
    const cA = await contact(db, A.orgId)
    const cB = await contact(db, B.orgId)
    await expect(validatePropertyContact(db, A.orgId, { propertyKind: 'agent', propertyId: B.propertyId, contactId: cA.id, role: 'owner' }, null)).rejects.toMatchObject({ statusCode: 404 })
    await expect(validatePropertyContact(db, A.orgId, { propertyKind: 'developer', propertyId: A.projectId, contactId: cB.id, role: 'owner' }, null)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lista los contactos de una propiedad y las propiedades de un contacto (los dos catálogos)', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'OwnersListA')
    const ana = await contact(db, A.orgId, { name: 'Ana' })
    await db.insert(schema.propertyContacts).values([
      { organizationId: A.orgId, propertyKind: 'agent', propertyId: A.propertyId, contactId: ana.id, role: 'owner', ownershipPct: 100, isPrimary: 1, createdAt: ts, updatedAt: ts },
      { organizationId: A.orgId, propertyKind: 'developer', propertyId: A.projectId, contactId: ana.id, role: 'tenant', createdAt: ts, updatedAt: ts },
      { organizationId: A.orgId, propertyKind: 'developer', propertyId: A.projectId, contactId: ana.id, role: 'contact', createdAt: ts, updatedAt: ts, deletedAt: ts },
    ])
    const onProperty = await listPropertyContacts(db, A.orgId, 'agent', A.propertyId)
    expect(onProperty).toEqual([expect.objectContaining({ contactId: ana.id, name: 'Ana', role: 'owner', ownershipPct: 100 })])
    const props = await listContactProperties(db, A.orgId, ana.id)
    expect(props.map((p) => `${p.propertyKind}:${p.role}`).sort()).toEqual(['agent:owner', 'developer:tenant'])
  })
})

describe('notas (notes)', () => {
  it('se cuelgan de una entidad real de la agencia y rellenan la columna que toca', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'NotesA')
    const B = await seedTenant(db, 'NotesB')
    const c = await contact(db, A.orgId)

    const onContact: Record<string, any> = { entityType: 'contact', entityId: c.id, body: 'Prefiere llamadas por la tarde' }
    await validateNotePayload(db, A.orgId, onContact, null)
    expect(onContact.contactId).toBe(c.id)

    await db.update(schema.leads).set({ contactId: c.id }).where(eq(schema.leads.id, A.leadId))
    const onLead: Record<string, any> = { entityType: 'lead', entityId: A.leadId, body: 'Pide visita' }
    await validateNotePayload(db, A.orgId, onLead, null)
    expect(onLead).toMatchObject({ leadId: A.leadId, contactId: c.id })

    const onProperty: Record<string, any> = { entityType: 'property', entityId: A.projectId, propertyKind: 'developer', body: 'Llaves en portería' }
    await validateNotePayload(db, A.orgId, onProperty, null)
    expect(onProperty.propertyId).toBe(A.projectId)

    await expect(validateNotePayload(db, A.orgId, { entityType: 'lead', entityId: B.leadId, body: 'x' }, null)).rejects.toMatchObject({ statusCode: 404 })
    await expect(validateNotePayload(db, A.orgId, { entityType: 'contact', entityId: c.id, body: '   ' }, null)).rejects.toThrow(/vacía/)
    await expect(validateNotePayload(db, A.orgId, { entityType: 'factura', entityId: 1, body: 'x' }, null)).rejects.toThrow(/Tipo de entidad/)
  })
})

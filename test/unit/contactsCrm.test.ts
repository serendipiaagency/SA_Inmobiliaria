import { and, eq } from 'drizzle-orm'
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

describe('unificar contactos duplicados: todo lo vinculado pasa al que se conserva', () => {
  /** Una persona con algo en cada tabla que cuelga de un contacto. */
  async function withEverything(db: any, t: any, c: any, tag: string) {
    const [offerAsBuyer] = await db
      .insert(schema.offers)
      .values({ organizationId: t.orgId, propertyId: t.propertyId, propertyKind: 'agent', buyerContactId: c.id, currentAmount: 200000, createdAt: ts, updatedAt: ts })
      .returning()
    const [deal] = await db
      .insert(schema.dealOperations)
      .values({ organizationId: t.orgId, propertyId: t.propertyId, propertyKind: 'agent', buyerContactId: c.id, acceptedOfferId: offerAsBuyer.id, agreedAmount: 200000, currency: 'eur', openedAt: ts, createdAt: ts, updatedAt: ts })
      .returning()
    const [req] = await db.insert(schema.buyerRequirements).values({ organizationId: t.orgId, contactId: c.id, title: `Piso ${tag}`, createdAt: ts, updatedAt: ts }).returning()
    const [match] = await db
      .insert(schema.propertyMatches)
      .values({ organizationId: t.orgId, buyerRequirementId: req.id, contactId: c.id, propertyId: t.propertyId, score: 70, status: 'selected', createdAt: ts, updatedAt: ts })
      .returning()
    const [task] = await db.insert(schema.tasks).values({ organizationId: t.orgId, type: 'call', title: `Llamar ${tag}`, contactId: c.id, createdAt: ts, updatedAt: ts }).returning()
    const [selection] = await db.insert(schema.propertySelections).values({ organizationId: t.orgId, contactId: c.id, title: `Selección ${tag}`, createdAt: ts, updatedAt: ts }).returning()
    const [note] = await db.insert(schema.notes).values({ organizationId: t.orgId, entityType: 'contact', entityId: c.id, contactId: c.id, body: `Nota ${tag}` }).returning()
    const [doc] = await db.insert(schema.propertyDocuments).values({ organizationId: t.orgId, propertyKind: 'agent', propertyId: t.propertyId, docType: 'other', title: `Doc ${tag}` }).returning()
    await db.insert(schema.propertyDocumentAccess).values({ organizationId: t.orgId, documentId: doc.id, contactId: c.id })
    await db.insert(schema.contactRoles).values({ organizationId: t.orgId, contactId: c.id, role: 'buyer' })
    await db.insert(schema.propertyContacts).values({ organizationId: t.orgId, propertyKind: 'agent', propertyId: t.propertyId, contactId: c.id, role: 'tenant' })
    return { offerAsBuyer, deal, req, match, task, selection, note, doc }
  }

  it('mueve cada vínculo, resuelve los repetidos y archiva el duplicado sin tocar otra agencia', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'MergeAllA')
    const B = await seedTenant(db, 'MergeAllB')
    const { previewMerge, mergeContacts } = await import('../../server/utils/contacts/merge')
    const { recordActivity, listActivity } = await import('../../server/utils/activity/service')

    const master = await contact(db, A.orgId, { name: 'Lucía Gómez', language: null })
    const dup = await contact(db, A.orgId, { name: 'Lucia Gomez', language: 'en', country: 'Reino Unido', notes: 'Viene por recomendación' })
    const own = await withEverything(db, A, dup, 'dup')
    await db.update(schema.leads).set({ contactId: dup.id }).where(eq(schema.leads.id, A.leadId))
    await db.update(schema.visits).set({ contactId: dup.id }).where(eq(schema.visits.id, A.visitId))
    const [leadNote] = await db.insert(schema.notes).values({ organizationId: A.orgId, entityType: 'lead', entityId: A.leadId, leadId: A.leadId, contactId: dup.id, body: 'Pide visita' }).returning()
    const [client] = await db.insert(schema.clients).values({ organizationId: A.orgId, name: 'Lucia Gomez', contactId: dup.id }).returning()

    // Repetidos que chocarían con un índice único o con el mismo papel:
    // los dos son propietarios de la misma propiedad (30 % + 20 %), los dos
    // tienen el rol «owner», acceso al mismo documento, la misma etiqueta y
    // venden en la misma oferta.
    await db.insert(schema.propertyContacts).values([
      { organizationId: A.orgId, propertyKind: 'developer', propertyId: A.projectId, contactId: master.id, role: 'owner', ownershipPct: 20, notes: 'Escritura 2019' },
      { organizationId: A.orgId, propertyKind: 'developer', propertyId: A.projectId, contactId: dup.id, role: 'owner', ownershipPct: 30, isPrimary: 1, notes: 'Herencia' },
      { organizationId: A.orgId, propertyKind: 'developer', propertyId: A.projectId, contactId: dup.id, role: 'contact', deletedAt: ts },
    ])
    await db.insert(schema.contactRoles).values([
      { organizationId: A.orgId, contactId: master.id, role: 'owner' },
      { organizationId: A.orgId, contactId: dup.id, role: 'owner' },
    ])
    await db.insert(schema.propertyDocumentAccess).values({ organizationId: A.orgId, documentId: own.doc.id, contactId: master.id })
    const [otherBuyer] = await db.insert(schema.contacts).values({ organizationId: A.orgId, name: 'Comprador', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const [offerSold] = await db
      .insert(schema.offers)
      .values({ organizationId: A.orgId, propertyId: A.propertyId, propertyKind: 'agent', buyerContactId: otherBuyer.id, currentAmount: 300000, createdAt: ts, updatedAt: ts })
      .returning()
    await db.insert(schema.offerSellers).values([
      { offerId: offerSold.id, contactId: master.id, createdAt: ts },
      { offerId: offerSold.id, contactId: dup.id, createdAt: ts },
    ])
    const [offerOnlyDup] = await db
      .insert(schema.offers)
      .values({ organizationId: A.orgId, propertyId: A.propertyId, propertyKind: 'agent', buyerContactId: otherBuyer.id, currentAmount: 310000, createdAt: ts, updatedAt: ts })
      .returning()
    await db.insert(schema.offerSellers).values({ offerId: offerOnlyDup.id, contactId: dup.id, createdAt: ts })
    const [tagA] = await db.insert(schema.tags).values({ organizationId: A.orgId, name: 'VIP', slug: 'vip', createdAt: ts }).returning()
    const [tagB] = await db.insert(schema.tags).values({ organizationId: A.orgId, name: 'Inversor', slug: 'inversor', createdAt: ts }).returning()
    await db.insert(schema.tagLinks).values([
      { organizationId: A.orgId, tagId: tagA.id, entityType: 'contact', entityId: master.id, createdAt: ts },
      { organizationId: A.orgId, tagId: tagA.id, entityType: 'contact', entityId: dup.id, createdAt: ts },
      { organizationId: A.orgId, tagId: tagB.id, entityType: 'contact', entityId: dup.id, createdAt: ts },
    ])
    const [defBudget] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'contact', key: 'presupuesto', label: 'Presupuesto', fieldType: 'number' }).returning()
    const [defNif] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'contact', key: 'nif', label: 'NIF', fieldType: 'text' }).returning()
    await db.insert(schema.customFieldValues).values([
      { organizationId: A.orgId, definitionId: defBudget.id, entityType: 'contact', entityId: master.id, valueNumber: 400000 },
      { organizationId: A.orgId, definitionId: defBudget.id, entityType: 'contact', entityId: dup.id, valueNumber: 350000 },
      { organizationId: A.orgId, definitionId: defNif.id, entityType: 'contact', entityId: dup.id, valueText: 'X1234567L' },
    ])
    await recordActivity(db, A.orgId, { eventType: 'TASK_CREATED', entityType: 'task', entityId: own.task.id, contactId: dup.id, actorType: 'user', actorId: A.userId })

    // La otra agencia tiene su propia pareja con todo — nada suyo se mueve.
    const bMaster = await contact(db, B.orgId)
    const bDup = await contact(db, B.orgId)
    const bOwn = await withEverything(db, B, bDup, 'B')

    const preview = await previewMerge(ev(db), A.orgId, master.id, dup.id)
    expect(preview.blockers).toEqual([])
    expect(preview.relations).toMatchObject({
      buyerRequirements: 1,
      leads: 1,
      clients: 1,
      propertyContacts: 2, // inquilino + propietario (la de la papelera no cuenta)
      roles: 2,
      notes: 2,
      tasks: 1,
      visits: 1,
      offers: 3, // comprador en una, vendedor en dos
      dealOperations: 1,
      selections: 1,
      documentAccess: 1,
      matches: 1,
      tags: 2,
      customFields: 2,
    })

    const merged = await mergeContacts(ev(db), A.orgId, { masterId: master.id, duplicateId: dup.id }, { userId: A.userId })
    expect(merged).toMatchObject({ id: master.id, language: 'en', country: 'Reino Unido', notes: 'Viene por recomendación' })

    const [dupAfter] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, dup.id))
    expect(dupAfter.status).toBe('archived')
    expect(dupAfter.deletedAt).toBeTruthy()

    const contactOf = async (table: any, id: number, col = 'contactId') => (await db.select().from(table).where(eq(table.id, id)))[0][col]
    expect(await contactOf(schema.buyerRequirements, own.req.id)).toBe(master.id)
    expect(await contactOf(schema.leads, A.leadId)).toBe(master.id)
    expect(await contactOf(schema.clients, client.id)).toBe(master.id)
    expect(await contactOf(schema.propertyMatches, own.match.id)).toBe(master.id)
    expect(await contactOf(schema.tasks, own.task.id)).toBe(master.id)
    expect(await contactOf(schema.visits, A.visitId)).toBe(master.id)
    expect(await contactOf(schema.propertySelections, own.selection.id)).toBe(master.id)
    expect(await contactOf(schema.offers, own.offerAsBuyer.id, 'buyerContactId')).toBe(master.id)
    expect(await contactOf(schema.dealOperations, own.deal.id, 'buyerContactId')).toBe(master.id)
    expect(await contactOf(schema.notes, leadNote.id)).toBe(master.id)
    const [noteAfter] = await db.select().from(schema.notes).where(eq(schema.notes.id, own.note.id))
    expect(noteAfter).toMatchObject({ entityType: 'contact', entityId: master.id, contactId: master.id })

    // Propiedades: una sola fila de propietario con el % sumado; la del duplicado, en la papelera y en él.
    const links = await db.select().from(schema.propertyContacts).where(eq(schema.propertyContacts.organizationId, A.orgId))
    const liveOwners = links.filter((l: any) => l.role === 'owner' && !l.deletedAt)
    expect(liveOwners).toHaveLength(1)
    expect(liveOwners[0]).toMatchObject({ contactId: master.id, ownershipPct: 50, isPrimary: 1, notes: 'Escritura 2019\n\nHerencia' })
    expect(links.find((l: any) => l.role === 'owner' && l.deletedAt)?.contactId).toBe(dup.id)
    expect(links.find((l: any) => l.role === 'tenant')?.contactId).toBe(master.id)
    expect(links.find((l: any) => l.role === 'contact')).toMatchObject({ contactId: master.id }) // la que ya estaba en la papelera se mueve como historia
    expect(links.find((l: any) => l.role === 'contact')?.deletedAt).toBe(ts)

    const roles = await db.select().from(schema.contactRoles).where(eq(schema.contactRoles.organizationId, A.orgId))
    expect(roles.filter((r: any) => r.contactId === dup.id)).toEqual([])
    expect(roles.filter((r: any) => r.contactId === master.id).map((r: any) => r.role).sort()).toEqual(['buyer', 'owner'])

    const access = await db.select().from(schema.propertyDocumentAccess).where(eq(schema.propertyDocumentAccess.organizationId, A.orgId))
    expect(access.map((a: any) => [a.documentId, a.contactId])).toEqual([[own.doc.id, master.id]])

    const sellers = await db.select().from(schema.offerSellers)
    expect(sellers.filter((s: any) => s.offerId === offerSold.id).map((s: any) => s.contactId)).toEqual([master.id])
    expect(sellers.filter((s: any) => s.offerId === offerOnlyDup.id).map((s: any) => s.contactId)).toEqual([master.id])

    const tagLinks = await db.select().from(schema.tagLinks).where(and(eq(schema.tagLinks.organizationId, A.orgId), eq(schema.tagLinks.entityType, 'contact')))
    expect(tagLinks.filter((l: any) => l.entityId === dup.id)).toEqual([])
    expect(tagLinks.filter((l: any) => l.entityId === master.id).map((l: any) => l.tagId).sort()).toEqual([tagA.id, tagB.id].sort())

    // Campos personalizados: el NIF (sólo lo tenía el duplicado) pasa; el
    // presupuesto distinto del duplicado no pisa el del superviviente.
    const values = await db.select().from(schema.customFieldValues).where(eq(schema.customFieldValues.organizationId, A.orgId))
    expect(values.find((v: any) => v.definitionId === defNif.id)?.entityId).toBe(master.id)
    expect(values.filter((v: any) => v.definitionId === defBudget.id).map((v: any) => [v.entityId, v.valueNumber]).sort()).toEqual([
      [master.id, 400000],
      [dup.id, 350000],
    ].sort())

    // La cronología del superviviente incluye la del duplicado y el propio evento de la unificación.
    const timeline = (await listActivity(db, A.orgId, { contactId: master.id })).rows
    expect(timeline.map((r: any) => r.eventType)).toEqual(['CONTACT_MERGED', 'TASK_CREATED'])

    // Nada de la otra agencia se ha movido.
    expect(await contactOf(schema.buyerRequirements, bOwn.req.id)).toBe(bDup.id)
    expect(await contactOf(schema.offers, bOwn.offerAsBuyer.id, 'buyerContactId')).toBe(bDup.id)
    expect(await contactOf(schema.tasks, bOwn.task.id)).toBe(bDup.id)
    expect(await contactOf(schema.propertySelections, bOwn.selection.id)).toBe(bDup.id)
    const bAccess = await db.select().from(schema.propertyDocumentAccess).where(eq(schema.propertyDocumentAccess.organizationId, B.orgId))
    expect(bAccess.map((a: any) => a.contactId)).toEqual([bDup.id])
    const [bDupAfter] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, bDup.id))
    expect(bDupAfter.deletedAt).toBeNull()
    expect(bMaster.id).not.toBe(master.id)

    // Y no se puede unificar con un contacto de otra agencia.
    await expect(previewMerge(ev(db), A.orgId, master.id, bDup.id)).rejects.toThrow(/no encontrado/)
  })

  it('no unifica a quien es comprador y vendedor en la misma oferta u operación (y no mueve nada)', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'MergeSidesA')
    const { previewMerge, mergeContacts, ContactMergeError } = await import('../../server/utils/contacts/merge')
    const buyer = await contact(db, A.orgId, { name: 'Marta Ruiz' })
    const seller = await contact(db, A.orgId, { name: 'Marta Ruíz' })
    const [offer] = await db
      .insert(schema.offers)
      .values({ organizationId: A.orgId, propertyId: A.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, currentAmount: 250000, createdAt: ts, updatedAt: ts })
      .returning()
    await db.insert(schema.offerSellers).values({ offerId: offer.id, contactId: seller.id, createdAt: ts })
    const [task] = await db.insert(schema.tasks).values({ organizationId: A.orgId, type: 'call', title: 'Llamar', contactId: seller.id, createdAt: ts, updatedAt: ts }).returning()

    const preview = await previewMerge(ev(db), A.orgId, buyer.id, seller.id)
    expect(preview.blockers).toEqual([`Son comprador y vendedor en la oferta #${offer.id}: no pueden ser la misma persona.`])
    await expect(mergeContacts(ev(db), A.orgId, { masterId: buyer.id, duplicateId: seller.id })).rejects.toBeInstanceOf(ContactMergeError)
    // En el otro sentido, igual.
    await expect(mergeContacts(ev(db), A.orgId, { masterId: seller.id, duplicateId: buyer.id })).rejects.toThrow(/comprador y vendedor/)

    const [sellerAfter] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seller.id))
    expect(sellerAfter.deletedAt).toBeNull()
    const [taskAfter] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id))
    expect(taskAfter.contactId).toBe(seller.id)

    // Lo mismo con una operación abierta.
    const [deal] = await db
      .insert(schema.dealOperations)
      .values({ organizationId: A.orgId, propertyId: A.propertyId, propertyKind: 'agent', buyerContactId: seller.id, acceptedOfferId: offer.id, agreedAmount: 250000, currency: 'eur', openedAt: ts, createdAt: ts, updatedAt: ts })
      .returning()
    await db.insert(schema.dealOperationSellers).values({ dealOperationId: deal.id, contactId: buyer.id, createdAt: ts })
    expect((await previewMerge(ev(db), A.orgId, buyer.id, seller.id)).blockers).toContain(`Son comprador y vendedor en la operación #${deal.id}: no pueden ser la misma persona.`)
  })

  it('una cadena de unificaciones (A → B → C) conserva la historia de los tres', async () => {
    const { db } = createTestDb()
    const T = await seedTenant(db, 'MergeChain')
    const { mergeContacts } = await import('../../server/utils/contacts/merge')
    const { recordActivity, listActivity } = await import('../../server/utils/activity/service')
    const a = await contact(db, T.orgId, { name: 'A' })
    const b = await contact(db, T.orgId, { name: 'B' })
    const c = await contact(db, T.orgId, { name: 'C' })
    for (const x of [a, b, c]) await recordActivity(db, T.orgId, { eventType: 'TASK_CREATED', entityType: 'task', entityId: x.id, contactId: x.id, actorType: 'system' })

    await mergeContacts(ev(db), T.orgId, { masterId: b.id, duplicateId: a.id })
    await mergeContacts(ev(db), T.orgId, { masterId: c.id, duplicateId: b.id })

    const rows = (await listActivity(db, T.orgId, { contactId: c.id })).rows
    expect(rows.filter((r: any) => r.eventType === 'TASK_CREATED').map((r: any) => r.contactId).sort()).toEqual([a.id, b.id, c.id].sort())
    // Un contacto sin unificaciones sigue viendo sólo lo suyo.
    const d = await contact(db, T.orgId, { name: 'D' })
    expect((await listActivity(db, T.orgId, { contactId: d.id })).rows).toEqual([])
  })
})

import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import { assertLiveProperty, isPropertyTrashed, livePropertyCond, propertyState, trashedPropertyCond, trashedPropertyMessage } from '../../server/utils/properties/trash'

/**
 * Papelera de propiedades (deleted_at, migración 0086).
 *
 * Borrar una propiedad desde el panel ya no la elimina: la manda a la
 * papelera. Lo que se prueba aquí es lo que eso promete, contra el esquema
 * real migrado (createTestDb): que la condición «propiedad viva» es una sola
 * y funciona en las dos tablas, que la búsqueda, la selección «todos los
 * filtrados» y el matching no devuelven borradas, que no se puede crear nada
 * nuevo sobre una borrada, y que la papelera de otra agencia es
 * indistinguible de la nada.
 *
 * Los servicios resuelven la base de datos con `useDb(event)` (D1 en el
 * Worker); aquí se sustituye por la instancia de test, igual que en
 * propertySearchService.test.ts.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
const trashedAt = '2026-02-01T10:00:00.000Z'

function ev(db: any) {
  return { context: { db } } as any
}

async function trashAgent(db: any, id: number) {
  await db.update(schema.agentProperties).set({ deletedAt: trashedAt }).where(eq(schema.agentProperties.id, id))
}
async function trashDeveloper(db: any, id: number) {
  await db.update(schema.developerProperties).set({ deletedAt: trashedAt }).where(eq(schema.developerProperties.id, id))
}

async function seedContact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}

describe('helper de la papelera (server/utils/properties/trash.ts)', () => {
  it('livePropertyCond / trashedPropertyCond separan las dos vistas en los dos catálogos', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashCond')
    const [extraAgent] = await db
      .insert(schema.agentProperties)
      .values({ organizationId: t.orgId, slug: 'borrada-2h', price: 1, status: 'available', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })
      .returning({ id: schema.agentProperties.id })
    const [extraDev] = await db
      .insert(schema.developerProperties)
      .values({ organizationId: t.orgId, developerId: t.developerId, name: 'Borrada web', slug: 'borrada-web', status: 'new', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })
      .returning({ id: schema.developerProperties.id })

    const A = schema.agentProperties
    const D = schema.developerProperties
    const liveAgent = await db.select({ id: A.id }).from(A).where(and(eq(A.organizationId, t.orgId), livePropertyCond(A)))
    const trashAgentRows = await db.select({ id: A.id }).from(A).where(and(eq(A.organizationId, t.orgId), trashedPropertyCond(A)))
    expect(liveAgent.map((r: any) => r.id)).toEqual([t.propertyId])
    expect(trashAgentRows.map((r: any) => r.id)).toEqual([extraAgent.id])

    const liveDev = await db.select({ id: D.id }).from(D).where(and(eq(D.organizationId, t.orgId), livePropertyCond(D)))
    const trashDevRows = await db.select({ id: D.id }).from(D).where(and(eq(D.organizationId, t.orgId), trashedPropertyCond(D)))
    expect(liveDev.map((r: any) => r.id)).toEqual([t.projectId])
    expect(trashDevRows.map((r: any) => r.id)).toEqual([extraDev.id])
  })

  it('funciona dentro de una subconsulta en SQL crudo (el patrón de los contadores por comercial del listado de Comerciales)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashSubquery')
    await db.update(schema.agentProperties).set({ agentId: t.teamMemberId }).where(eq(schema.agentProperties.id, t.propertyId))
    await db.insert(schema.agentProperties).values({ organizationId: t.orgId, slug: 'asignada-borrada', agentId: t.teamMemberId, status: 'available', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })

    const tm = schema.teamMembers
    const [row] = await db
      .select({
        n: sql<number>`(select count(*) from agent_properties where agent_properties.agent_id = ${tm.id} and ${livePropertyCond(schema.agentProperties)})`,
      })
      .from(tm)
      .where(eq(tm.id, t.teamMemberId))
    expect(Number(row.n), 'la asignada que está en la papelera no cuenta').toBe(1)
  })

  it('propertyState: viva, en la papelera, o inexistente — y la papelera de otra agencia es «inexistente»', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TrashStateA')
    const b = await seedTenant(db, 'TrashStateB')
    await trashAgent(db, b.propertyId)

    expect(await propertyState(db, a.orgId, 'agent', a.propertyId)).toBe('live')
    expect(await propertyState(db, a.orgId, 'developer', a.projectId)).toBe('live')
    expect(await propertyState(db, b.orgId, 'agent', b.propertyId)).toBe('trashed')
    // A no distingue la papelera de B de un id que no existe.
    expect(await propertyState(db, a.orgId, 'agent', b.propertyId)).toBe('missing')
    expect(await propertyState(db, a.orgId, 'agent', 999_999)).toBe('missing')
  })

  it('assertLiveProperty: 404 si no es de la agencia, 422 claro si está en la papelera', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TrashAssertA')
    const b = await seedTenant(db, 'TrashAssertB')
    await trashDeveloper(db, a.projectId)

    await expect(assertLiveProperty(db, a.orgId, 'agent', a.propertyId)).resolves.toBeUndefined()
    await expect(assertLiveProperty(db, a.orgId, 'developer', a.projectId, { action: 'crear una oferta' })).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: trashedPropertyMessage('crear una oferta'),
    })
    await expect(assertLiveProperty(db, a.orgId, 'developer', b.projectId)).rejects.toMatchObject({ statusCode: 404 })
    expect(trashedPropertyMessage('crear una oferta')).toBe('La propiedad está en la papelera: restáurala antes de crear una oferta.')
    expect(isPropertyTrashed({ deletedAt: trashedAt })).toBe(true)
    expect(isPropertyTrashed({ deletedAt: null })).toBe(false)
  })
})

describe('búsqueda y selección masiva no devuelven propiedades de la papelera', () => {
  it('searchPropertiesCompact (selector de Calendar y Comunicaciones), en los dos catálogos', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashSearch')
    const { searchPropertiesCompact } = await import('../../server/utils/properties/searchService')
    await db.update(schema.agentProperties).set({ city: 'Papelerópolis', reference: 'S-VIVA' }).where(eq(schema.agentProperties.id, t.propertyId))
    await db.insert(schema.agentProperties).values({ organizationId: t.orgId, slug: 'borrada', reference: 'S-BORRADA', city: 'Papelerópolis', status: 'available', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })
    await db.update(schema.developerProperties).set({ name: 'Papelerópolis Viva' }).where(eq(schema.developerProperties.id, t.projectId))
    await db.insert(schema.developerProperties).values({ organizationId: t.orgId, developerId: t.developerId, name: 'Papelerópolis Borrada', slug: 'pp-borrada', status: 'new', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })

    const rows = await searchPropertiesCompact(ev(db), t.orgId, 'Papelerópolis')
    expect(rows.map((r) => `${r.kind}:${r.name}`).sort()).toEqual(['agent:S-VIVA', 'developer:Papelerópolis Viva'])
  })

  it('el mismo filtro (buildPropertyFilterConds) sirve para el listado y para la Papelera: la condición la pone quien llama', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashFilter')
    const { buildPropertyFilterConds } = await import('../../server/utils/properties/searchService')
    await db.insert(schema.agentProperties).values({ organizationId: t.orgId, slug: 'cara-borrada', price: 900_000, status: 'available', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })
    await db.insert(schema.agentProperties).values({ organizationId: t.orgId, slug: 'cara-viva', price: 900_000, status: 'available', createdAt: ts, updatedAt: ts })
    const A = schema.agentProperties
    const filter = buildPropertyFilterConds('agent', { priceMin: 800_000 })
    const live = await db.select({ slug: A.slug }).from(A).where(and(eq(A.organizationId, t.orgId), livePropertyCond(A), ...filter))
    const trash = await db.select({ slug: A.slug }).from(A).where(and(eq(A.organizationId, t.orgId), trashedPropertyCond(A), ...filter))
    expect(live.map((r: any) => r.slug)).toEqual(['cara-viva'])
    expect(trash.map((r: any) => r.slug)).toEqual(['cara-borrada'])
  })

  it('«seleccionar todos los filtrados» de las acciones masivas ignora la papelera, y un elemento que se borró a mitad de lote falla con su motivo', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashBulk')
    const { resolveFilteredPropertyIds, propertyBulkHandlers } = await import('../../server/utils/bulkActions/propertyActions')
    await db.update(schema.agentProperties).set({ city: 'Bulkia' }).where(eq(schema.agentProperties.id, t.propertyId))
    const [trashed] = await db
      .insert(schema.agentProperties)
      .values({ organizationId: t.orgId, slug: 'bulk-borrada', city: 'Bulkia', status: 'available', deletedAt: trashedAt, createdAt: ts, updatedAt: ts })
      .returning({ id: schema.agentProperties.id })

    const ids = await resolveFilteredPropertyIds(ev(db), t.orgId, 'agent', { city: 'Bulkia' })
    expect(ids).toEqual([t.propertyId])

    const handlers = propertyBulkHandlers('agent')
    await expect(handlers.change_status(ev(db), t.orgId, trashed.id, { status: 'sold' })).rejects.toMatchObject({ statusCode: 422 })
    const [after] = await db.select({ status: schema.agentProperties.status }).from(schema.agentProperties).where(eq(schema.agentProperties.id, trashed.id))
    expect(after.status, 'la acción no tocó la propiedad de la papelera').toBe('available')
  })
})

describe('matching: una propiedad en la papelera no es candidata ni recibe decisiones nuevas', () => {
  it('Necesidad → inmuebles no la devuelve; Inmueble → compradores responde «no encontrado»; seleccionarla es un error claro', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashMatching')
    const contact = await seedContact(db, t.orgId, 'Compradora')
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { findPropertiesForRequirement, findRequirementsForProperty, setMatchStatus, MatchStatusError } = await import('../../server/utils/matching/service')

    const req = await createBuyerRequirement(ev(db), t.orgId, { contactId: contact.id, operation: 'sale', priceMax: 700_000 })
    await db.update(schema.developerProperties).set({ transactionType: 'sale', price: 650_000 }).where(eq(schema.developerProperties.id, t.projectId))
    await db.update(schema.agentProperties).set({ transactionType: 'sale', price: 300_000 }).where(eq(schema.agentProperties.id, t.propertyId))

    // Antes de borrar: las dos salen.
    const before = await findPropertiesForRequirement(ev(db), t.orgId, req.id, { includeIneligible: true })
    expect(before!.results.some((r) => r.propertyKind === 'developer' && r.property.id === t.projectId)).toBe(true)
    expect(before!.results.some((r) => r.propertyKind === 'agent' && r.property.id === t.propertyId)).toBe(true)

    await trashDeveloper(db, t.projectId)
    await trashAgent(db, t.propertyId)

    const after = await findPropertiesForRequirement(ev(db), t.orgId, req.id, { includeIneligible: true })
    expect(after!.results.some((r) => r.propertyKind === 'developer' && r.property.id === t.projectId)).toBe(false)
    expect(after!.results.some((r) => r.propertyKind === 'agent' && r.property.id === t.propertyId)).toBe(false)

    expect(await findRequirementsForProperty(ev(db), t.orgId, t.projectId, 'developer')).toBeNull()
    expect(await findRequirementsForProperty(ev(db), t.orgId, t.propertyId, 'agent')).toBeNull()

    await expect(
      setMatchStatus(ev(db), t.orgId, { buyerRequirementId: req.id, propertyId: t.projectId, propertyKind: 'developer', status: 'selected' }, { userId: t.userId }),
    ).rejects.toBeInstanceOf(MatchStatusError)
  })
})

describe('publicación multicanal: una propiedad de la papelera no se publica', () => {
  it('un trabajo de publicar queda «blocked» sin llamar al canal; uno de retirar sí se ejecuta', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashDispatch')
    const { executeJob } = await import('../../server/utils/publication/dispatcher')
    const [sched] = await db
      .insert(schema.publicationSchedules)
      .values({ organizationId: t.orgId, developerPropertyId: t.projectId, name: 'Lanzamiento', baseScheduledAt: ts, timezone: 'UTC', status: 'scheduled', createdAt: ts, updatedAt: ts })
      .returning()
    const insertJob = async (action: string) =>
      (
        await db
          .insert(schema.publicationJobs)
          .values({ organizationId: t.orgId, scheduleId: sched.id, channelKey: 'own_web', runAt: ts, action, status: 'pending', createdAt: ts, updatedAt: ts })
          .returning()
      )[0]
    const publishJob = await insertJob('publish')
    const unpublishJob = await insertJob('unpublish')
    await trashDeveloper(db, t.projectId)

    const published = await executeJob(db, {}, publishJob, 'test-run')
    expect(published.outcome).toBe('blocked')
    expect(published.result?.message).toBe(trashedPropertyMessage('publicarla'))
    const [jobRow] = await db.select().from(schema.publicationJobs).where(eq(schema.publicationJobs.id, publishJob.id))
    expect(jobRow.status).toBe('blocked')
    expect(jobRow.retryCount, 'no gasta reintentos').toBe(0)

    // Retirarla de los canales es justo lo que conviene: no lo frena la papelera.
    const withdrawn = await executeJob(db, {}, unpublishJob, 'test-run')
    expect(withdrawn.result?.message).not.toBe(trashedPropertyMessage('publicarla'))
  })
})

describe('no se crea nada nuevo sobre una propiedad de la papelera (y la historia se conserva)', () => {
  it('oferta, tarea y selección nuevas → 422; la tarea heredada de una visita ya hecha, sí', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashCreate')
    const buyer = await seedContact(db, t.orgId, 'Comprador')
    const { createOffer, listOffers } = await import('../../server/utils/offers/service')
    const { createTask } = await import('../../server/utils/tasks/service')
    const { createPropertySelection } = await import('../../server/utils/selections/service')

    // Una oferta que ya existía antes de borrar…
    const previous = await createOffer(db, t.orgId, { propertyId: t.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 290_000 })
    await trashAgent(db, t.propertyId)

    await expect(createOffer(db, t.orgId, { propertyId: t.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 280_000 })).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: trashedPropertyMessage('crear una oferta'),
    })
    // …sigue ahí: borrar la propiedad no reescribe la historia.
    expect((await listOffers(db, t.orgId, { buyerContactId: buyer.id })).map((o: any) => o.id)).toEqual([previous.id])

    await expect(createTask(db, t.orgId, { type: 'call', title: 'Llamar', propertyId: t.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({ statusCode: 422 })
    const inherited = await createTask(db, t.orgId, { type: 'follow_up', title: 'Seguimiento', propertyId: t.propertyId, propertyKind: 'agent' }, { allowTrashedProperty: true })
    expect(inherited.propertyId).toBe(t.propertyId)

    await expect(
      createPropertySelection(db, t.orgId, { contactId: buyer.id, title: 'Para Ana', items: [{ propertyId: t.propertyId, propertyKind: 'agent' }] }),
    ).rejects.toMatchObject({ statusCode: 422 })
    // La de obra nueva sigue viva y se puede seleccionar.
    const sel = await createPropertySelection(db, t.orgId, { contactId: buyer.id, title: 'Para Ana', items: [{ propertyId: t.projectId, propertyKind: 'developer' }] })
    expect(sel!.items).toHaveLength(1)
  })

  it('restaurar (deleted_at = null) la devuelve a la búsqueda y al matching', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'TrashRestore')
    const { searchPropertiesCompact } = await import('../../server/utils/properties/searchService')
    await db.update(schema.developerProperties).set({ name: 'Restaurable' }).where(eq(schema.developerProperties.id, t.projectId))
    await trashDeveloper(db, t.projectId)
    expect(await searchPropertiesCompact(ev(db), t.orgId, 'Restaurable')).toHaveLength(0)
    // Lo mismo que hace POST /api/admin/developer-properties/:id/restore.
    await db.update(schema.developerProperties).set({ deletedAt: null }).where(eq(schema.developerProperties.id, t.projectId))
    expect((await searchPropertiesCompact(ev(db), t.orgId, 'Restaurable')).map((r) => r.id)).toEqual([t.projectId])
    expect(await propertyState(db, t.orgId, 'developer', t.projectId)).toBe('live')
  })
})

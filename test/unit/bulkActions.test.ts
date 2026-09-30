import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createBulkActionJob, getBulkActionJob, processNextBulkActionItem } from '../../server/utils/bulkActions/service'
import { propertyBulkHandlers, resolveFilteredPropertyIds } from '../../server/utils/bulkActions/propertyActions'
import { leadBulkHandlers } from '../../server/utils/bulkActions/leadActions'
import { getOrCreateTag, linkTag, listTagsForEntity } from '../../server/utils/tags/service'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 28 — Bulk Actions. El framework (job + items, una fila por
 * elemento, nunca un UPDATE masivo que se salte el resultado individual,
 * §104) se prueba aquí contra los handlers reales de Properties, no una
 * reimplementación — mismo criterio que el resto de la suite
 * (`createTestDb()` aplica las migraciones reales sobre SQLite en memoria).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
function ev(db: any) {
  return { context: { db } } as any
}

async function seedAgentProperty(db: any, orgId: number, overrides: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.agentProperties)
    .values({ organizationId: orgId, slug: `bulk-${Math.random().toString(36).slice(2)}`, price: 100000, status: 'available', createdAt: ts, updatedAt: ts, ...overrides })
    .returning()
  return row
}

/** Todos los campos que PropertySchemaRegistry exige para publicar obra nueva (name, transactionType, country, city, area, price, description, coverImage) — la fila con la que se prueba que "publicar" sí puede tener éxito. */
async function seedPublishableProject(db: any, orgId: number, developerId: number, overrides: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.developerProperties)
    .values({
      organizationId: orgId,
      developerId,
      name: 'Torre Completa',
      slug: `publish-${Math.random().toString(36).slice(2)}`,
      status: 'new',
      transactionType: 'sale',
      country: 'España',
      city: 'Marbella',
      area: 120,
      price: 500000,
      description: 'Descripción completa para publicar',
      coverImage: 'uploads/cover.jpg',
      createdAt: ts,
      updatedAt: ts,
      ...overrides,
    })
    .returning()
  return row
}

describe('createBulkActionJob + processNextBulkActionItem — el motor genérico', () => {
  it('procesa un elemento por llamada, con resultado individual (§104), hasta completed', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkOk')
    const a = await seedAgentProperty(db, fixture.orgId)
    const b = await seedAgentProperty(db, fixture.orgId)

    const job = await createBulkActionJob(ev(db), fixture.orgId, fixture.userId, {
      entityType: 'agent',
      action: 'change_status',
      params: { status: 'sold' },
      ids: [a.id, b.id],
    })
    expect(job.totalCount).toBe(2)
    expect(job.status).toBe('pending')

    const handlers = propertyBulkHandlers('agent')
    const first = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(first.done).toBe(false)
    expect((first as any).item.status).toBe('done')

    const second = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(second.done).toBe(false)

    const third = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(third.done).toBe(true)
    expect(third.job!.status).toBe('completed')
    expect(third.job!.completedCount).toBe(2)
    expect(third.job!.failedCount).toBe(0)

    const [rowA] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, a.id))
    const [rowB] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, b.id))
    expect(rowA.status).toBe('sold')
    expect(rowB.status).toBe('sold')
  })

  it('un fallo de validación en un elemento no aborta el resto — partial, no "Error" a secas (§104)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPartial')
    const ok = await seedAgentProperty(db, fixture.orgId)

    // 'available' no existe como estado de developer_properties — la misma
    // acción sobre un id que no pertenece al catálogo del job falla su
    // propia validación, sin tocar el resto de elementos del job.
    const job = await createBulkActionJob(ev(db), fixture.orgId, fixture.userId, {
      entityType: 'agent',
      action: 'change_status',
      params: { status: 'not_a_real_status' },
      ids: [ok.id],
    })
    const handlers = propertyBulkHandlers('agent')
    const result = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect((result as any).item.status).toBe('failed')
    expect((result as any).item.errorMessage).toContain('Estado inválido')

    const done = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(done.done).toBe(true)
    expect(done.job!.status).toBe('failed') // todos fallaron, 0 completados
    expect(done.job!.failedCount).toBe(1)
  })

  it('mezcla de éxitos y fallos en el mismo job termina en "partial", nunca en un "Error" único', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkMixed')
    const good = await seedAgentProperty(db, fixture.orgId)
    const bad = await seedAgentProperty(db, fixture.orgId)
    // Borrada antes de procesarse — simula el caso real "una fila pudo
    // desaparecer entre seleccionarla y que le toque el turno".
    await db.delete(schema.agentProperties).where(eq(schema.agentProperties.id, bad.id))

    const job = await createBulkActionJob(ev(db), fixture.orgId, fixture.userId, {
      entityType: 'agent',
      action: 'change_status',
      params: { status: 'sold' },
      ids: [good.id, bad.id],
    })
    const handlers = propertyBulkHandlers('agent')
    await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    const final = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)

    expect(final.done).toBe(true)
    expect(final.job!.status).toBe('partial')
    expect(final.job!.completedCount).toBe(1)
    expect(final.job!.failedCount).toBe(1)

    const { items } = (await getBulkActionJob(ev(db), fixture.orgId, job.id))!
    const badItem = items.find((i: any) => i.targetId === bad.id)
    expect(badItem?.status).toBe('failed')
    expect(badItem?.errorMessage).toContain('no encontrada')
  })

  it('reintentar process-next sobre un job ya terminado no reprocesa nada (idempotencia, §105)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkIdempotent')
    const a = await seedAgentProperty(db, fixture.orgId)
    const job = await createBulkActionJob(ev(db), fixture.orgId, fixture.userId, { entityType: 'agent', action: 'change_status', params: { status: 'sold' }, ids: [a.id] })
    const handlers = propertyBulkHandlers('agent')
    await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    const finished = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(finished.done).toBe(true)

    const again = await processNextBulkActionItem(ev(db), fixture.orgId, job.id, handlers)
    expect(again.done).toBe(true)
    expect(again.job!.completedCount).toBe(1) // no se cuenta dos veces
  })

  it('aislamiento entre tenants: un job de una organización no se puede procesar ni leer desde otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'BulkTenantA')
    const b = await seedTenant(db, 'BulkTenantB')
    const prop = await seedAgentProperty(db, a.orgId)
    const job = await createBulkActionJob(ev(db), a.orgId, a.userId, { entityType: 'agent', action: 'change_status', params: { status: 'sold' }, ids: [prop.id] })

    await expect(processNextBulkActionItem(ev(db), b.orgId, job.id, propertyBulkHandlers('agent'))).rejects.toMatchObject({ statusCode: 404 })
    expect(await getBulkActionJob(ev(db), b.orgId, job.id)).toBeNull()
  })

  it('rechaza una selección vacía y una selección por encima del tope', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkLimits')
    await expect(createBulkActionJob(ev(db), fixture.orgId, fixture.userId, { entityType: 'agent', action: 'change_status', params: {}, ids: [] })).rejects.toMatchObject({
      statusCode: 422,
    })
    const tooMany = Array.from({ length: 2001 }, (_, i) => i + 1)
    await expect(createBulkActionJob(ev(db), fixture.orgId, fixture.userId, { entityType: 'agent', action: 'change_status', params: {}, ids: tooMany })).rejects.toMatchObject({
      statusCode: 422,
    })
  })
})

describe('propertyBulkHandlers — change_commercial y add_tag', () => {
  it('change_commercial reutiliza la relación real (agentId) y valida que el comercial exista en la organización', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkCommercial')
    const prop = await seedAgentProperty(db, fixture.orgId)
    const handlers = propertyBulkHandlers('agent')

    await handlers.change_commercial(ev(db), fixture.orgId, prop.id, { commercialId: fixture.teamMemberId })
    const [row] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, prop.id))
    expect(row.agentId).toBe(fixture.teamMemberId)

    await expect(handlers.change_commercial(ev(db), fixture.orgId, prop.id, { commercialId: 999999 })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('add_tag crea la etiqueta si no existe y no la duplica si se aplica dos veces (idempotencia)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkTag')
    const prop = await seedAgentProperty(db, fixture.orgId)
    const handlers = propertyBulkHandlers('agent')

    await handlers.add_tag(ev(db), fixture.orgId, prop.id, { tagName: 'Exclusiva VIP' })
    await handlers.add_tag(ev(db), fixture.orgId, prop.id, { tagName: 'Exclusiva VIP' }) // reintento

    const tags = await listTagsForEntity(ev(db), fixture.orgId, 'agent', prop.id)
    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('Exclusiva VIP')
  })
})

describe('resolveFilteredPropertyIds — "seleccionar todos los resultados filtrados" (§84)', () => {
  it('reutiliza el mismo filtro que el listado (searchService.ts), no una segunda interpretación', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkSelectAll')
    const cheap = await seedAgentProperty(db, fixture.orgId, { price: 50000, city: 'Marbella' })
    const expensive = await seedAgentProperty(db, fixture.orgId, { price: 900000, city: 'Marbella' })
    const otherCity = await seedAgentProperty(db, fixture.orgId, { price: 50000, city: 'Madrid' })

    const ids = await resolveFilteredPropertyIds(ev(db), fixture.orgId, 'agent', { city: 'Marbella', priceMax: '100000' })
    expect(ids).toContain(cheap.id)
    expect(ids).not.toContain(expensive.id)
    expect(ids).not.toContain(otherCity.id)
  })
})

describe('propertyBulkHandlers — publish/withdraw (FASE 28 incremento 2, §90-91)', () => {
  it('publica sólo cuando el estado resultante cumple requiredForPublish — misma validación que una edición manual', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPublishOk')
    const complete = await seedPublishableProject(db, fixture.orgId, fixture.developerId)
    const handlers = propertyBulkHandlers('developer')

    await handlers.publish(ev(db), fixture.orgId, complete.id, {})
    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, complete.id))
    expect(row.publishedAt).toBeTruthy()

    // Publicar una propiedad ya publicada no falla ni "vuelve a publicarla" — idempotente.
    await handlers.publish(ev(db), fixture.orgId, complete.id, {})
    const [again] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, complete.id))
    expect(again.publishedAt).toBe(row.publishedAt)
  })

  it('rechaza publicar cuando faltan campos requiredForPublish, con el detalle de qué falta', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPublishMissing')
    // fixture.projectId (seedTenant) no trae country/city/transactionType/
    // description/coverImage — exactamente el caso "guardado como borrador,
    // nunca publicado" que §90 pide bloquear.
    const handlers = propertyBulkHandlers('developer')
    await expect(handlers.publish(ev(db), fixture.orgId, fixture.projectId, {})).rejects.toMatchObject({ statusCode: 422 })
  })

  it('publicar/retirar no aplican a 2ª mano (agent-properties no tiene consumidor público)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPublishAgent')
    const prop = await seedAgentProperty(db, fixture.orgId)
    const handlers = propertyBulkHandlers('agent')
    await expect(handlers.publish(ev(db), fixture.orgId, prop.id, {})).rejects.toMatchObject({ statusCode: 422 })
    await expect(handlers.withdraw(ev(db), fixture.orgId, prop.id, {})).rejects.toMatchObject({ statusCode: 422 })
  })

  it('retirar limpia publishedAt sin borrar la fila, y es idempotente sobre una ya retirada', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkWithdraw')
    const complete = await seedPublishableProject(db, fixture.orgId, fixture.developerId, { publishedAt: ts })
    const handlers = propertyBulkHandlers('developer')

    await handlers.withdraw(ev(db), fixture.orgId, complete.id, {})
    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, complete.id))
    expect(row.publishedAt).toBeNull()
    expect(row.id).toBe(complete.id) // nunca delete

    await handlers.withdraw(ev(db), fixture.orgId, complete.id, {}) // ya retirada
    const [again] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, complete.id))
    expect(again.publishedAt).toBeNull()
  })
})

describe('propertyBulkHandlers — update_price (FASE 28 incremento 2, §94-95)', () => {
  it('actualizar precio en 2ª mano SIEMPRE genera su fila en agent_property_price_history, primer escritor de esa tabla', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPriceAgent')
    const prop = await seedAgentProperty(db, fixture.orgId, { price: 200000 })
    const handlers = propertyBulkHandlers('agent')

    await handlers.update_price(ev(db), fixture.orgId, prop.id, { price: 180000 })

    const [row] = await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, prop.id))
    expect(row.price).toBe(180000)
    const history = await db.select().from(schema.agentPropertyPriceHistory).where(eq(schema.agentPropertyPriceHistory.propertyId, prop.id))
    expect(history).toHaveLength(1)
    expect(history[0].price).toBe(180000)
  })

  it('actualizar precio en obra nueva escribe en price_history, igual que una edición manual', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPriceDeveloper')
    const handlers = propertyBulkHandlers('developer')

    await handlers.update_price(ev(db), fixture.orgId, fixture.projectId, { price: 450000 })

    const [row] = await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, fixture.projectId))
    expect(row.price).toBe(450000)
    const history = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, fixture.projectId))
    expect(history).toHaveLength(1)
    expect(history[0].price).toBe(450000)
  })

  it('rechaza un precio inválido (cero, negativo o no numérico) sin tocar el histórico', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkPriceInvalid')
    const prop = await seedAgentProperty(db, fixture.orgId)
    const handlers = propertyBulkHandlers('agent')

    await expect(handlers.update_price(ev(db), fixture.orgId, prop.id, { price: 0 })).rejects.toMatchObject({ statusCode: 422 })
    await expect(handlers.update_price(ev(db), fixture.orgId, prop.id, { price: -100 })).rejects.toMatchObject({ statusCode: 422 })
    const history = await db.select().from(schema.agentPropertyPriceHistory).where(eq(schema.agentPropertyPriceHistory.propertyId, prop.id))
    expect(history).toHaveLength(0)
  })
})

describe('leadBulkHandlers — FASE 28 incremento 3 (§97-100)', () => {
  it('change_commercial reutiliza leads/routing.ts#reassignLead y atribuye la reasignación a job.requestedBy en lead_assignment_history', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkLeadCommercial')
    const handlers = leadBulkHandlers()

    await handlers.change_commercial(ev(db), fixture.orgId, fixture.leadId, { commercialId: fixture.teamMemberId }, fixture.userId)
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, fixture.leadId))
    expect(row.agentId).toBe(fixture.teamMemberId)

    const history = await db.select().from(schema.leadAssignmentHistory).where(eq(schema.leadAssignmentHistory.leadId, fixture.leadId))
    expect(history).toHaveLength(1)
    expect(history[0].toCommercialId).toBe(fixture.teamMemberId)
    expect(history[0].assignedBy).toBe(fixture.userId)

    await expect(handlers.change_commercial(ev(db), fixture.orgId, fixture.leadId, { commercialId: 999999 }, fixture.userId)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('change_stage reutiliza leads/pipeline.ts#transitionLeadStage — único escritor de leads.stage, genera lead_stage_history', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkLeadStage')
    const handlers = leadBulkHandlers()

    await handlers.change_stage(ev(db), fixture.orgId, fixture.leadId, { stage: 'qualified' }, fixture.userId)
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, fixture.leadId))
    expect(row.stage).toBe('qualified')

    const history = await db.select().from(schema.leadStageHistory).where(eq(schema.leadStageHistory.leadId, fixture.leadId))
    expect(history).toHaveLength(1)
    expect(history[0].toStage).toBe('qualified')

    await expect(handlers.change_stage(ev(db), fixture.orgId, fixture.leadId, { stage: 'not_a_real_stage' }, fixture.userId)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('add_tag usa el mismo Tag transversal que Properties, con "lead" como entityType — idempotente', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'BulkLeadTag')
    const handlers = leadBulkHandlers()

    await handlers.add_tag(ev(db), fixture.orgId, fixture.leadId, { tagName: 'Urgente' })
    await handlers.add_tag(ev(db), fixture.orgId, fixture.leadId, { tagName: 'Urgente' }) // reintento

    const tags = await listTagsForEntity(ev(db), fixture.orgId, 'lead', fixture.leadId)
    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('Urgente')
  })

  it('create_task genera una fila de Task real por lead, nunca una sola Task compartida por el lote', async () => {
    const { db } = createTestDb()
    const fixtureA = await seedTenant(db, 'BulkLeadTaskA')
    const fixtureB = await seedTenant(db, 'BulkLeadTaskB')
    const handlers = leadBulkHandlers()

    await handlers.create_task(ev(db), fixtureA.orgId, fixtureA.leadId, { type: 'call', title: 'Llamar para confirmar visita' }, fixtureA.userId)
    await handlers.create_task(ev(db), fixtureB.orgId, fixtureB.leadId, { type: 'call', title: 'Llamar para confirmar visita' }, fixtureB.userId)

    const tasksA = await db.select().from(schema.tasks).where(eq(schema.tasks.leadId, fixtureA.leadId))
    const tasksB = await db.select().from(schema.tasks).where(eq(schema.tasks.leadId, fixtureB.leadId))
    expect(tasksA).toHaveLength(1)
    expect(tasksB).toHaveLength(1)
    expect(tasksA[0].id).not.toBe(tasksB[0].id)
    expect(tasksA[0].createdBy).toBe(fixtureA.userId)
  })

  it('aislamiento entre tenants: un lead de otra organización no se puede tocar (404, no un fallo silencioso)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'BulkLeadTenantA')
    const b = await seedTenant(db, 'BulkLeadTenantB')
    const handlers = leadBulkHandlers()

    await expect(handlers.change_commercial(ev(db), b.orgId, a.leadId, { commercialId: null }, b.userId)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('tags/service.ts — getOrCreateTag', () => {
  it('reutiliza una etiqueta existente por su slug en vez de crear un duplicado', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TagReuse')
    const first = await getOrCreateTag(ev(db), fixture.orgId, 'Vista al mar')
    const second = await getOrCreateTag(ev(db), fixture.orgId, 'Vista al mar')
    expect(second.id).toBe(first.id)

    const all = await db.select().from(schema.tags).where(eq(schema.tags.organizationId, fixture.orgId))
    expect(all).toHaveLength(1)
  })

  it('linkTag es idempotente: enlazar dos veces la misma etiqueta a la misma entidad no duplica la fila', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TagLink')
    const tag = await getOrCreateTag(ev(db), fixture.orgId, 'Reformada')
    await linkTag(ev(db), fixture.orgId, tag.id, 'developer', 42)
    await linkTag(ev(db), fixture.orgId, tag.id, 'developer', 42)
    const links = await db.select().from(schema.tagLinks).where(eq(schema.tagLinks.tagId, tag.id))
    expect(links).toHaveLength(1)
  })
})

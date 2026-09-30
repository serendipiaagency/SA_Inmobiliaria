import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createBulkActionJob, getBulkActionJob, processNextBulkActionItem } from '../../server/utils/bulkActions/service'
import { propertyBulkHandlers, resolveFilteredPropertyIds } from '../../server/utils/bulkActions/propertyActions'
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

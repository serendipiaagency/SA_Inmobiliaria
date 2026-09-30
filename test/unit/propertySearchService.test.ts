import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 27 — Property Search Service. Antes de esto, "precioMin"→`gte(...)`
 * vivía duplicado (developer-properties / properties) en
 * `[resource]/index.get.ts`, y ni exclusividad, ni estado de publicación, ni
 * fecha de captación/actualización tenían filtro en ningún listado. Este
 * archivo prueba el filtro real (`buildPropertyFilterConds`) contra el
 * esquema real, no una reimplementación — mismo criterio que el resto de la
 * suite (`createTestDb()` aplica las migraciones reales sobre SQLite en
 * memoria).
 *
 * `searchPropertiesCompact` resuelve la base de datos con `useDb(event)`
 * (D1 real en el Worker); aquí se sustituye por la instancia de test, igual
 * que en `buyerRequirementLifecycleAndMatching.test.ts`.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
function ev(db: any) {
  return { context: { db } } as any
}

describe('buildPropertyFilterConds — filtros nuevos en FASE 27, sin cobertura antes en ningún listado', () => {
  it('exclusividad y estado de publicación', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SearchExcl')
    const { buildPropertyFilterConds } = await import('../../server/utils/properties/searchService')

    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'exclusiva-publicada',
      price: 400000,
      status: 'available',
      isExclusive: 1,
      publishedAt: '2026-03-01 10:00:00',
      createdAt: ts,
      updatedAt: ts,
    })
    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'no-exclusiva-sin-publicar',
      price: 400000,
      status: 'available',
      isExclusive: 0,
      publishedAt: null,
      createdAt: ts,
      updatedAt: ts,
    })

    const orgCond = eq(schema.agentProperties.organizationId, fixture.orgId)

    const onlyExclusive = buildPropertyFilterConds('agent', { isExclusive: true })
    const exclusiveRows = await db.select({ slug: schema.agentProperties.slug }).from(schema.agentProperties).where(and(orgCond, ...onlyExclusive))
    expect(exclusiveRows.map((r: any) => r.slug)).toEqual(['exclusiva-publicada'])

    // No se compara con el listado exacto de filas: seedTenant() ya crea su
    // propia propiedad 2ª mano sin publishedAt, así que también es "sin
    // publicar" legítimamente — lo que importa es que la exclusiva-publicada
    // quede fuera y la nuestra, dentro.
    const onlyUnpublished = buildPropertyFilterConds('agent', { published: 'unpublished' })
    const unpublishedRows = await db.select({ slug: schema.agentProperties.slug }).from(schema.agentProperties).where(and(orgCond, ...onlyUnpublished))
    const unpublishedSlugs = unpublishedRows.map((r: any) => r.slug)
    expect(unpublishedSlugs).toContain('no-exclusiva-sin-publicar')
    expect(unpublishedSlugs).not.toContain('exclusiva-publicada')
  })

  it('rango de fecha de captación', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SearchCapture')
    const { buildPropertyFilterConds } = await import('../../server/utils/properties/searchService')

    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'captada-febrero',
      price: 100000,
      status: 'available',
      captureDate: '2026-02-15',
      createdAt: ts,
      updatedAt: ts,
    })
    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'captada-enero',
      price: 100000,
      status: 'available',
      captureDate: '2026-01-05',
      createdAt: ts,
      updatedAt: ts,
    })

    const orgCond = eq(schema.agentProperties.organizationId, fixture.orgId)
    const conds = buildPropertyFilterConds('agent', { capturedFrom: '2026-02-01', capturedTo: '2026-02-28' })
    const rows = await db.select({ slug: schema.agentProperties.slug }).from(schema.agentProperties).where(and(orgCond, ...conds))
    expect(rows.map((r: any) => r.slug)).toEqual(['captada-febrero'])
  })

  it('el "hasta" de fecha de actualización es inclusivo del día completo aunque la columna lleve hora', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SearchEndOfDay')
    const { buildPropertyFilterConds } = await import('../../server/utils/properties/searchService')

    // Actualizada a última hora del día — un `lte` ingenuo contra "2026-03-10"
    // (sin hora) la dejaría fuera, porque en comparación de texto el prefijo
    // corto siempre ordena por debajo del más largo.
    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'actualizada-tarde',
      price: 100000,
      status: 'available',
      createdAt: ts,
      updatedAt: '2026-03-10 23:30:00',
    })

    const orgCond = eq(schema.agentProperties.organizationId, fixture.orgId)
    const conds = buildPropertyFilterConds('agent', { updatedFrom: '2026-03-10', updatedTo: '2026-03-10' })
    const rows = await db.select({ slug: schema.agentProperties.slug }).from(schema.agentProperties).where(and(orgCond, ...conds))
    expect(rows.map((r: any) => r.slug)).toEqual(['actualizada-tarde'])
  })

  it('transactionType ahora también filtra developer_properties, no sólo agent_properties (antes obra nueva se asumía venta implícita)', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SearchDevTx')
    const { buildPropertyFilterConds } = await import('../../server/utils/properties/searchService')

    await db.insert(schema.developerProperties).values({
      organizationId: fixture.orgId,
      developerId: fixture.developerId,
      name: 'Rental Tower',
      slug: 'rental-tower',
      status: 'new',
      price: 900000,
      transactionType: 'rent',
      createdAt: ts,
      updatedAt: ts,
    })

    const orgCond = eq(schema.developerProperties.organizationId, fixture.orgId)
    const rentOnly = buildPropertyFilterConds('developer', { transactionType: 'rent' })
    const rows = await db.select({ name: schema.developerProperties.name }).from(schema.developerProperties).where(and(orgCond, ...rentOnly))
    expect(rows.map((r: any) => r.name)).toEqual(['Rental Tower'])

    // La torre que crea seedTenant() no fija transactionType — se queda en el
    // default 'sale' de la columna — así que un filtro "sale" la sigue viendo.
    const saleOnly = buildPropertyFilterConds('developer', { transactionType: 'sale' })
    const saleRows = await db.select({ name: schema.developerProperties.name }).from(schema.developerProperties).where(and(orgCond, ...saleOnly))
    expect(saleRows.map((r: any) => r.name)).toEqual(['SearchDevTx Tower'])
  })
})

describe('parsePropertyFilters — traduce una query string HTTP', () => {
  it('valores vacíos o ausentes se quedan en undefined, no en NaN/false por defecto', async () => {
    const { parsePropertyFilters } = await import('../../server/utils/properties/searchService')
    const result = parsePropertyFilters({})
    expect(Object.values(result).every((v) => v === undefined)).toBe(true)
  })

  it('interpreta números, booleanos ("1"/"0") y el enum de "published"', async () => {
    const { parsePropertyFilters } = await import('../../server/utils/properties/searchService')
    expect(parsePropertyFilters({ priceMin: '100000', isExclusive: '1', published: 'unpublished' })).toMatchObject({
      priceMin: 100000,
      isExclusive: true,
      published: 'unpublished',
    })
    expect(parsePropertyFilters({ isExclusive: '0' }).isExclusive).toBe(false)
  })

  it('un "published" que no es uno de los dos valores válidos se descarta en vez de colarse a SQL', async () => {
    const { parsePropertyFilters } = await import('../../server/utils/properties/searchService')
    expect(parsePropertyFilters({ published: 'algo-inventado' }).published).toBeUndefined()
  })
})

describe('searchPropertiesCompact — búsqueda cross-catálogo compartida con Calendar (FASE 20/27)', () => {
  it('busca en los dos catálogos a la vez, etiqueta cada fila con su kind y respeta el tenant', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'CrossKind')
    const otherTenant = await seedTenant(db, 'OtherOrg')
    const { searchPropertiesCompact } = await import('../../server/utils/properties/searchService')

    // seedTenant ya crea "CrossKind Tower" (developer_properties, localizable
    // por nombre); el catálogo 2ª mano de seedTenant sólo fija `location`, no
    // `city`/`street`/`reference` (los campos que busca esta función), así
    // que se añade una fila propia para probar también el lado agent.
    await db.insert(schema.agentProperties).values({
      organizationId: fixture.orgId,
      slug: 'compact-search-agent',
      city: 'CrossKind City',
      price: 250000,
      status: 'available',
      createdAt: ts,
      updatedAt: ts,
    })
    // Del otro tenant, aunque coincida el texto, nunca debe aparecer.
    await db.insert(schema.agentProperties).values({
      organizationId: otherTenant.orgId,
      slug: 'compact-search-agent-other-org',
      city: 'CrossKind City',
      price: 250000,
      status: 'available',
      createdAt: ts,
      updatedAt: ts,
    })

    const rows = await searchPropertiesCompact(ev(db), fixture.orgId, 'CrossKind', 20)
    const kinds = rows.map((r) => r.kind)
    expect(kinds).toContain('developer')
    expect(kinds).toContain('agent')
    expect(rows.length).toBe(2) // sólo las del tenant correcto
  })
})

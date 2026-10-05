import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import { buildLeadListWhere, exportLeadRows, LEAD_EXPORT_BATCH, listLeadsPage, resolveFilteredLeadIds, type SqlRunner } from '../../server/utils/leads/list'
import { getOrCreateTagDb } from '../../server/utils/tags/service'

/**
 * FASE 28 (bloque N7b) — el listado de leads paginado y la exportación CSV
 * completa. Antes el listado (y con él todo lo exportable desde la pantalla)
 * se cortaba en 200 filas. El SQL es el mismo que corre en D1, ejecutado aquí
 * con SQLite real sobre las migraciones reales.
 */

const ts = '2026-01-01 00:00:00'
let db: any
let sqlite: any
let A: TenantFixture
let B: TenantFixture
let run: SqlRunner
/** Cuántos parámetros llevó la consulta más grande (D1 admite como máximo 100). */
let maxBinds = 0

beforeEach(async () => {
  ;({ db, sqlite } = createTestDb())
  A = await seedTenant(db, 'ExportAlpha')
  B = await seedTenant(db, 'ExportBeta')
  maxBinds = 0
  run = async (sql, binds) => {
    maxBinds = Math.max(maxBinds, binds.length)
    return sqlite.prepare(sql).all(...(binds as any[]))
  }
})

/** Muchos leads de golpe: un INSERT por lote, con fechas distintas para que el orden sea estable. */
function insertLeads(orgId: number, n: number, over: (i: number) => Record<string, unknown> = () => ({})) {
  const stmt = sqlite.prepare(
    `INSERT INTO leads (organization_id, name, email, source, status, stage, score, created_at, updated_at) VALUES (?, ?, ?, ?, 'new', 'new', ?, ?, ?)`,
  )
  sqlite.exec('BEGIN')
  for (let i = 0; i < n; i++) {
    const o = over(i)
    const created = `2026-02-${String(1 + (i % 28)).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:00:00`
    stmt.run(orgId, `Lead ${orgId}-${i}`, `lead-${orgId}-${i}@x.test`, (o.source as string) ?? 'web', (o.score as number) ?? 0, created, created)
  }
  sqlite.exec('COMMIT')
}

describe('exportación CSV de leads sin tope', () => {
  it('devuelve TODAS las filas del filtro (más de 200 y de varios lotes), cada una una vez, sólo de la agencia', async () => {
    insertLeads(A.orgId, 1234)
    insertLeads(B.orgId, 50)
    const rows = await exportLeadRows(run, A.orgId, {})
    // + el lead que ya trae el seed de la agencia.
    expect(rows).toHaveLength(1235)
    expect(new Set(rows.map((r) => r.id)).size).toBe(1235)
    const idsB = new Set(sqlite.prepare('SELECT id FROM leads WHERE organization_id = ?').all(B.orgId).map((r: any) => r.id))
    expect(idsB.size).toBe(51)
    expect(rows.some((r) => idsB.has(r.id))).toBe(false)
    expect(rows.length).toBeGreaterThan(LEAD_EXPORT_BATCH * 2)
    expect(maxBinds).toBeLessThan(100)
  })

  it('respeta el filtro (origen, puntuación) y añade las etiquetas de cada lead', async () => {
    insertLeads(A.orgId, 300, (i) => ({ source: i % 3 === 0 ? 'portal' : 'web', score: i % 100 }))
    const portal = await exportLeadRows(run, A.orgId, { source: 'portal' })
    expect(portal).toHaveLength(100)
    expect(portal.every((r) => r.source === 'portal')).toBe(true)
    const top = await exportLeadRows(run, A.orgId, { scoreMin: '90' })
    expect(top.every((r) => Number(r.score) >= 90)).toBe(true)

    const tag = await getOrCreateTagDb(db, A.orgId, 'Caliente')
    await db.insert(schema.tagLinks).values({ organizationId: A.orgId, tagId: tag.id, entityType: 'lead', entityId: A.leadId, createdAt: ts })
    const tagged = await exportLeadRows(run, A.orgId, { tags: String(tag.id) })
    expect(tagged.map((r) => r.id)).toEqual([A.leadId])
    expect(tagged[0].tags).toBe('Caliente')
  })

  it('una selección de 150 ids viaja como UN parámetro (nunca choca con el límite de D1)', async () => {
    insertLeads(A.orgId, 10)
    const ids = [A.leadId, ...Array.from({ length: 150 }, (_, i) => 900000 + i)].join(',')
    const { binds } = buildLeadListWhere(A.orgId, { ids })
    expect(binds.length).toBeLessThan(5)
    const rows = await exportLeadRows(run, A.orgId, { ids })
    expect(rows.map((r) => r.id)).toEqual([A.leadId])
    // Un lead de otra agencia pedido por id no sale.
    expect(await exportLeadRows(run, A.orgId, { ids: String(B.leadId) })).toEqual([])
  })
})

describe('listado paginado', () => {
  it('páginas con el total real del filtro; sin parámetros, las 200 primeras como siempre', async () => {
    insertLeads(A.orgId, 260)
    const first = await listLeadsPage(run, A.orgId, {})
    expect(first).toMatchObject({ total: 261, page: 1, perPage: 200 })
    expect(first.rows).toHaveLength(200)

    const p1 = await listLeadsPage(run, A.orgId, { page: '1', perPage: '50' })
    const p6 = await listLeadsPage(run, A.orgId, { page: '6', perPage: '50' })
    expect(p1.rows).toHaveLength(50)
    expect(p6.rows).toHaveLength(11)
    // Recorrer todas las páginas da cada lead exactamente una vez (orden estable con id de desempate).
    const seen = new Set<number>()
    for (let page = 1; page <= 6; page++) for (const r of (await listLeadsPage(run, A.orgId, { page, perPage: 50 })).rows) seen.add(r.id)
    expect(seen.size).toBe(261)
    // perPage nunca pasa de 200.
    expect((await listLeadsPage(run, A.orgId, { perPage: '5000' })).perPage).toBe(200)
  })

  it('«todos los filtrados» de las acciones masivas: mismo filtro, con el tope + 1 para poder avisar', async () => {
    insertLeads(A.orgId, 40, (i) => ({ source: i < 30 ? 'portal' : 'web' }))
    expect(await resolveFilteredLeadIds(run, A.orgId, { source: 'portal' }, 2000)).toHaveLength(30)
    expect(await resolveFilteredLeadIds(run, A.orgId, { source: 'portal' }, 10)).toHaveLength(11)
    expect(await resolveFilteredLeadIds(run, B.orgId, { source: 'portal' }, 2000)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { and, eq, ne, sql } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'

/**
 * The same aggregation query shape as server/api/admin/[resource]/[id]/
 * performance.get.ts, run directly against a real seeded DB — proves the
 * scoping (organizationId + agentId together, never just agentId) is
 * correct without needing an HTTP round trip. leads/visits/deals have no
 * admin-facing create endpoint (they're written by public/CRM flows), so a
 * direct DB seed is the realistic way to set this up.
 */
async function performanceFor(db: any, orgId: number, agentId: number) {
  const [leadsTotal, leadsActive, visitsTotal, visitsCompleted, dealsRows] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(schema.leads).where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.agentId, agentId))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.agentId, agentId), ne(schema.leads.status, 'won'), ne(schema.leads.status, 'lost'))),
    db.select({ c: sql<number>`count(*)` }).from(schema.visits).where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.agentId, agentId))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.visits)
      .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.agentId, agentId), eq(schema.visits.status, 'completed'))),
    db.select({ dealValue: schema.deals.dealValue, commissionAmount: schema.deals.commissionAmount }).from(schema.deals).where(and(eq(schema.deals.organizationId, orgId), eq(schema.deals.agentId, agentId))),
  ])
  return {
    leadsAssigned: leadsTotal[0]?.c ?? 0,
    leadsActive: leadsActive[0]?.c ?? 0,
    visitsTotal: visitsTotal[0]?.c ?? 0,
    visitsCompleted: visitsCompleted[0]?.c ?? 0,
    dealsClosed: dealsRows.length,
    commercialVolume: dealsRows.reduce((sum: number, d: any) => sum + (d.dealValue || 0), 0),
    commissionTotal: dealsRows.reduce((sum: number, d: any) => sum + (d.commissionAmount || 0), 0),
  }
}

describe('Comerciales — métricas de rendimiento (leads/visitas/operaciones por agentId)', () => {
  it('cuenta solo lo asignado a ese comercial, no lo de otro comercial del mismo tenant', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'Rendimiento')
    const ts = '2026-01-01 00:00:00'

    const [otherAgent] = await db
      .insert(schema.teamMembers)
      .values({ organizationId: t.orgId, name: 'Otro comercial', slug: 'otro-comercial', email: 'otro@example.com', position: 'Agente', createdAt: ts, updatedAt: ts })
      .returning({ id: schema.teamMembers.id })

    await db.insert(schema.leads).values([
      { organizationId: t.orgId, name: 'Lead activo A', source: 'web', status: 'new', agentId: t.teamMemberId, createdAt: ts, updatedAt: ts },
      { organizationId: t.orgId, name: 'Lead ganado A', source: 'web', status: 'won', agentId: t.teamMemberId, createdAt: ts, updatedAt: ts },
      { organizationId: t.orgId, name: 'Lead de otro', source: 'web', status: 'new', agentId: otherAgent.id, createdAt: ts, updatedAt: ts },
    ])
    await db.insert(schema.visits).values([
      { organizationId: t.orgId, clientName: 'Cliente completado A', scheduledAt: ts, status: 'completed', agentId: t.teamMemberId, createdAt: ts },
      { organizationId: t.orgId, clientName: 'Cliente pendiente A', scheduledAt: ts, status: 'scheduled', agentId: t.teamMemberId, createdAt: ts },
      { organizationId: t.orgId, clientName: 'Cliente de otro', scheduledAt: ts, status: 'completed', agentId: otherAgent.id, createdAt: ts },
    ])
    await db.insert(schema.deals).values([
      { organizationId: t.orgId, clientName: 'Comprador A', dealValue: 200_000, commissionRate: 3, commissionAmount: 6_000, closedAt: ts, agentId: t.teamMemberId, createdAt: ts },
      { organizationId: t.orgId, clientName: 'Comprador de otro', dealValue: 999_000, commissionRate: 3, commissionAmount: 29_970, closedAt: ts, agentId: otherAgent.id, createdAt: ts },
    ])

    const perf = await performanceFor(db, t.orgId, t.teamMemberId)
    expect(perf.leadsAssigned).toBe(2)
    expect(perf.leadsActive).toBe(1) // 'won' is excluded from "active"
    expect(perf.visitsTotal).toBe(2)
    expect(perf.visitsCompleted).toBe(1)
    expect(perf.dealsClosed).toBe(1)
    expect(perf.commercialVolume).toBe(200_000)
    expect(perf.commissionTotal).toBe(6_000)

    const otherPerf = await performanceFor(db, t.orgId, otherAgent.id)
    expect(otherPerf.leadsAssigned).toBe(1)
    expect(otherPerf.visitsCompleted).toBe(1)
    expect(otherPerf.commercialVolume).toBe(999_000)
  })

  it('un comercial recién creado, sin actividad, muestra ceros reales — nunca una cifra inventada', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'SinActividad')
    const ts = '2026-01-01 00:00:00'
    const [freshAgent] = await db
      .insert(schema.teamMembers)
      .values({ organizationId: t.orgId, name: 'Comercial nuevo', slug: 'comercial-nuevo', email: 'nuevo@example.com', position: 'Agente', createdAt: ts, updatedAt: ts })
      .returning({ id: schema.teamMembers.id })

    const perf = await performanceFor(db, t.orgId, freshAgent.id)
    expect(perf).toEqual({ leadsAssigned: 0, leadsActive: 0, visitsTotal: 0, visitsCompleted: 0, dealsClosed: 0, commercialVolume: 0, commissionTotal: 0 })
  })
})

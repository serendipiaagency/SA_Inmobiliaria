import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { dashboardFilterOptions, getCommercialDashboard, parseDashboardScope } from '../../server/utils/dashboard/commercial'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * FASE 33 — Dashboard comercial. §137: con un dataset controlado de 1320
 * leads, 680 contactados, 390 cualificados, 212 con visita, 62 con oferta
 * y 28 con operación, el embudo reproduce exactamente esos números bajo la
 * definición de cohorte. §138: un filtro combinado (oficina + comercial +
 * origen + campaña + periodo) se aplica igual a todos los KPIs y al embudo.
 */
const ts = '2026-05-10 10:00:00'
let db: any
let a: TenantFixture
let b: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'DashAlpha')
  b = await seedTenant(db, 'DashBeta')
})

/** Horas de visita distintas: visits tiene un índice único (organización, comercial, hora). */
let slot = 0
function nextSlot() {
  slot += 1
  const day = 11 + Math.floor(slot / 600)
  const minutes = slot % 600
  return `2026-05-${String(day).padStart(2, '0')} ${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
}

async function insertChunks(table: any, rows: any[], size = 50) {
  const out: any[] = []
  for (let i = 0; i < rows.length; i += size) out.push(...(await db.insert(table).values(rows.slice(i, i + size)).returning({ id: table.id })))
  return out
}

/** N leads en el periodo, con las etapas como subconjuntos anidados (un embudo realista). */
async function seedFunnel(org: TenantFixture, n: { leads: number; contacted: number; qualified: number; viewings: number; offers: number; deals: number }, extra: Record<string, any> = {}) {
  const [contact] = await db.insert(schema.contacts).values({ organizationId: org.orgId, name: 'Comprador', createdAt: ts, updatedAt: ts }).returning()
  const leadRows = Array.from({ length: n.leads }, (_, i) => ({
    organizationId: org.orgId,
    name: `Lead ${i}`,
    source: 'web',
    status: 'new',
    stage: 'new',
    score: 0,
    createdAt: ts,
    updatedAt: ts,
    firstResponseAt: i < n.contacted ? '2026-05-10 10:30:00' : null,
    qualifiedAt: i < n.qualified ? '2026-05-12 09:00:00' : null,
    ...extra,
  }))
  const leads = await insertChunks(schema.leads, leadRows, 40)
  await insertChunks(
    schema.visits,
    leads.slice(0, n.viewings).map((l: any, i: number) => ({
      organizationId: org.orgId,
      clientName: `Lead ${i}`,
      scheduledAt: nextSlot(),
      status: i % 2 ? 'completed' : 'scheduled',
      type: 'property_viewing',
      leadId: l.id,
      agentId: extra.agentId ?? null,
      createdAt: ts,
    })),
  )
  const offers = await insertChunks(
    schema.offers,
    leads.slice(0, n.offers).map((l: any) => ({
      organizationId: org.orgId,
      propertyId: org.projectId,
      propertyKind: 'developer',
      buyerContactId: contact.id,
      leadId: l.id,
      commercialId: extra.agentId ?? null,
      currentAmount: 300000,
      status: 'submitted',
      createdAt: '2026-05-16 10:00:00',
      updatedAt: '2026-05-16 10:00:00',
    })),
  )
  await insertChunks(
    schema.dealOperations,
    leads.slice(0, n.deals).map((l: any, i: number) => ({
      organizationId: org.orgId,
      propertyId: org.projectId,
      propertyKind: 'developer',
      buyerContactId: contact.id,
      acceptedOfferId: offers[i].id,
      leadId: l.id,
      commercialId: extra.agentId ?? null,
      agreedAmount: 290000,
      currency: 'EUR',
      stage: 'closed',
      status: 'closed',
      openedAt: '2026-05-18 10:00:00',
      closedAt: '2026-05-25 10:00:00',
      createdAt: '2026-05-18 10:00:00',
      updatedAt: '2026-05-25 10:00:00',
    })),
  )
  return leads
}

const MAY = parseDashboardScope({ from: '2026-05-01', to: '2026-05-31' })

describe('Dashboard comercial (FASE 33)', () => {
  it('§137 — el embudo de cohorte reproduce exactamente 1320 / 680 / 390 / 212 / 62 / 28', async () => {
    await seedFunnel(a, { leads: 1320, contacted: 680, qualified: 390, viewings: 212, offers: 62, deals: 28 })
    const d = await getCommercialDashboard(db, a.orgId, MAY)
    expect(d.funnel.stages.map((s: any) => [s.key, s.value])).toEqual([
      ['leads', 1320],
      ['contacted', 680],
      ['qualified', 390],
      ['viewings', 212],
      ['offers', 62],
      ['deals', 28],
    ])
    expect(d.kpis.newLeads.value).toBe(1320)
    expect(d.kpis.qualifiedLeads.value).toBe(390)
    expect(d.kpis.offers.value).toBe(62)
    expect(d.kpis.dealsClosed.value).toBe(28)
    expect(d.kpis.completedViewings.value).toBe(106) // la mitad de las 212 están realizadas
    expect(d.kpis.conversion.value).toBe(2.1) // 28 / 1320
    expect(d.kpis.firstResponse).toMatchObject({ responded: 680, cohort: 1320, medianMinutes: 30, avgMinutes: 30 })
    // Cada KPI lleva su definición; ninguno es un número suelto.
    for (const k of Object.values(d.kpis) as any[]) expect(k.definition).toBeTruthy()

    // Otro periodo (junio) no hereda nada de mayo: la cohorte se define por fecha de alta.
    const june = await getCommercialDashboard(db, a.orgId, parseDashboardScope({ from: '2026-06-01', to: '2026-06-30' }))
    expect(june.funnel.stages[0].value).toBe(0)
    expect(june.kpis.conversion.value).toBeNull()
  })

  it('§138 — oficina + comercial + origen + campaña + periodo: todos los KPIs y el embudo usan el mismo scope', async () => {
    const [laura] = await db.insert(schema.teamMembers).values({ organizationId: a.orgId, name: 'Laura', slug: 'laura-dash', email: 'laura@dash.test', position: 'Comercial', officeName: 'Madrid', createdAt: ts, updatedAt: ts }).returning()
    const [pedro] = await db.insert(schema.teamMembers).values({ organizationId: a.orgId, name: 'Pedro', slug: 'pedro-dash', email: 'pedro@dash.test', position: 'Comercial', officeName: 'Madrid', createdAt: ts, updatedAt: ts }).returning()
    // Dentro del scope: Laura, Portal X, Autumn.
    await seedFunnel(a, { leads: 10, contacted: 8, qualified: 6, viewings: 4, offers: 2, deals: 1 }, { agentId: laura.id, source: 'Portal X', campaign: 'Autumn' })
    // Fuera: otro comercial de la misma oficina, otra campaña, otro origen.
    await seedFunnel(a, { leads: 7, contacted: 7, qualified: 7, viewings: 7, offers: 7, deals: 7 }, { agentId: pedro.id, source: 'Portal X', campaign: 'Autumn' })
    await seedFunnel(a, { leads: 5, contacted: 5, qualified: 5, viewings: 5, offers: 5, deals: 5 }, { agentId: laura.id, source: 'Portal X', campaign: 'Spring' })
    await seedFunnel(a, { leads: 3, contacted: 3, qualified: 3, viewings: 3, offers: 3, deals: 3 }, { agentId: laura.id, source: 'web', campaign: 'Autumn' })

    const scope = parseDashboardScope({ from: '2026-05-01', to: '2026-05-31', office: 'Madrid', commercialId: String(laura.id), source: 'Portal X', campaign: 'Autumn' })
    const d = await getCommercialDashboard(db, a.orgId, scope)
    expect(d.funnel.stages.map((s: any) => s.value)).toEqual([10, 8, 6, 4, 2, 1])
    expect(d.kpis.newLeads.value).toBe(10)
    expect(d.kpis.qualifiedLeads.value).toBe(6)
    expect(d.kpis.offers.value).toBe(2)
    expect(d.kpis.dealsClosed.value).toBe(1)
    expect(d.kpis.completedViewings.value).toBe(2)
    expect(d.byCommercial).toEqual([{ commercialId: laura.id, name: 'Laura', office: 'Madrid', leads: 10, qualified: 6, closed: 1 }])
    // El enlace de detalle lleva exactamente el mismo scope al listado de leads.
    expect(d.kpis.newLeads.link).toContain(`agentId=${laura.id}`)
    expect(d.kpis.newLeads.link).toContain('office=Madrid')
    expect(d.kpis.newLeads.link).toContain('campaign=Autumn')
    expect(d.kpis.newLeads.link).toContain('createdFrom=2026-05-01')

    // Sólo la oficina: suma los dos comerciales de Madrid.
    const office = await getCommercialDashboard(db, a.orgId, parseDashboardScope({ from: '2026-05-01', to: '2026-05-31', office: 'Madrid' }))
    expect(office.kpis.newLeads.value).toBe(25)
  })

  it('comparación sólo con periodo explícito, y aislamiento total entre agencias', async () => {
    await seedFunnel(a, { leads: 4, contacted: 2, qualified: 1, viewings: 0, offers: 0, deals: 0 })
    await seedFunnel(b, { leads: 50, contacted: 50, qualified: 50, viewings: 50, offers: 50, deals: 50 })
    const noCompare = await getCommercialDashboard(db, a.orgId, MAY)
    expect(noCompare.comparison).toBeNull()
    expect(noCompare.kpis.newLeads.value).toBe(4)
    expect(noCompare.kpis.offers.value).toBe(0)

    const withCompare = await getCommercialDashboard(db, a.orgId, parseDashboardScope({ from: '2026-05-01', to: '2026-05-31', compare: '1' }))
    expect(withCompare.comparison).toMatchObject({ from: '2026-03-31', to: '2026-04-30', newLeads: 0 })

    const options = await dashboardFilterOptions(db, a.orgId)
    expect(options.sources).toEqual(['web'])
  })

  it('valida el periodo', () => {
    expect(() => parseDashboardScope({ from: '2026-05-31', to: '2026-05-01' })).toThrow()
    expect(() => parseDashboardScope({ from: 'ayer', to: '2026-05-01' })).toThrow()
    expect(() => parseDashboardScope({ from: '2020-01-01', to: '2026-01-01' })).toThrow()
  })
})

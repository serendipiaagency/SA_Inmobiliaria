import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import {
  defaultLeadScoreRules,
  evaluateLeadScore,
  getLeadScoreDetail,
  getLeadScoreRules,
  recomputeExpiredLeadScores,
  recomputeLeadScore,
  saveLeadScoreRules,
  type LeadScoreSignals,
} from '../../server/utils/leads/score'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * FASE 32 — Lead Score explicable. Las dos primeras pruebas son los casos
 * del encargo (§135/§136): con las reglas por defecto, un lead con
 * presupuesto validado, compra en < 3 meses, respuesta hoy, visita
 * solicitada, financiación aprobada y 3 fichas abiertas puntúa exactamente
 * 84; quitando la financiación, 74 — y el desglose es reproducible.
 */
const NOW = Date.parse('2026-06-10T12:00:00Z')
const ts = '2026-06-01 09:00:00'

let db: any
let a: TenantFixture
let b: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'ScoreAlpha')
  b = await seedTenant(db, 'ScoreBeta')
})

function fullSignals(): LeadScoreSignals {
  return {
    requirements: [{ id: 1, budgetValidated: true, desiredDate: '2026-08-01', urgency: null, mortgageStatus: 'approved' }],
    lastInboundAt: '2026-06-10 08:00:00',
    lastInboundKind: 'whatsapp',
    lastOutboundAt: '2026-06-09 18:00:00',
    viewings: [{ id: 7, status: 'scheduled', scheduledAt: '2026-06-12 17:00:00' }],
    readPropertyShares: 3,
  }
}

describe('evaluateLeadScore (puro)', () => {
  it('§135 — con las reglas por defecto el lead completo puntúa 84 y el desglose explica cada punto', () => {
    const r = evaluateLeadScore(fullSignals(), defaultLeadScoreRules(), NOW)
    expect(r.score).toBe(84)
    const applied = r.breakdown.filter((b) => b.applied).map((b) => [b.criterion, b.points])
    expect(applied).toEqual([
      ['budget_validated', 20],
      ['purchase_horizon', 15],
      ['responded_recently', 15],
      ['viewing_requested', 20],
      ['financing_validated', 10],
      ['opened_listings', 4],
    ])
    // La penalización existe pero viene desactivada: ni siquiera aparece.
    expect(r.breakdown.some((b) => b.criterion === 'no_response')).toBe(false)
    // Cada línea dice el dato real, no un texto genérico.
    expect(r.breakdown.find((b) => b.criterion === 'purchase_horizon')!.detail).toContain('2026-08-01')
    // Reproducible: mismas señales + mismas reglas + mismo instante = mismo resultado.
    expect(evaluateLeadScore(fullSignals(), defaultLeadScoreRules(), NOW)).toEqual(r)
  })

  it('§136 — sin la financiación aprobada, 74', () => {
    const signals = fullSignals()
    signals.requirements[0].mortgageStatus = 'required'
    expect(evaluateLeadScore(signals, defaultLeadScoreRules(), NOW).score).toBe(74)
  })

  it('nunca inventa: sin señales, 0 — y el rango se mantiene en 0-100 aunque las reglas sumen más o resten', () => {
    const empty: LeadScoreSignals = { requirements: [], lastInboundAt: null, lastInboundKind: null, lastOutboundAt: null, viewings: [], readPropertyShares: 0 }
    expect(evaluateLeadScore(empty, defaultLeadScoreRules(), NOW).score).toBe(0)

    const big = defaultLeadScoreRules().map((r) => ({ ...r, points: r.points > 0 ? 60 : r.points }))
    expect(evaluateLeadScore(fullSignals(), big, NOW).score).toBe(100)

    const penalty = defaultLeadScoreRules().map((r) => (r.criterion === 'no_response' ? { ...r, enabled: true } : r))
    const ghosted: LeadScoreSignals = { ...empty, lastOutboundAt: '2026-05-01 10:00:00' }
    const g = evaluateLeadScore(ghosted, penalty, NOW)
    expect(g.breakdown.find((b) => b.criterion === 'no_response')).toMatchObject({ applied: true, points: -10 })
    expect(g.score).toBe(0)
  })

  it('las señales temporales caducan: «respondió» fuera de la ventana no cuenta, y expiresAt dice cuándo cambiará', () => {
    const signals = fullSignals()
    const r = evaluateLeadScore(signals, defaultLeadScoreRules(), NOW)
    // Respondió a las 08:00 → la señal caduca 24 h después.
    expect(r.expiresAt).toBe('2026-06-11 08:00:00')
    const later = evaluateLeadScore(signals, defaultLeadScoreRules(), Date.parse('2026-06-11T09:00:00Z'))
    expect(later.breakdown.find((b) => b.criterion === 'responded_recently')!.applied).toBe(false)
    expect(later.score).toBe(69)
  })

  it('una visita cancelada no es una visita solicitada; la urgencia alta sí es horizonte de compra', () => {
    const signals = fullSignals()
    signals.viewings = [{ id: 7, status: 'cancelled', scheduledAt: '2026-06-12 17:00:00' }]
    signals.requirements[0].desiredDate = null
    signals.requirements[0].urgency = 'urgent'
    const r = evaluateLeadScore(signals, defaultLeadScoreRules(), NOW)
    expect(r.breakdown.find((b) => b.criterion === 'viewing_requested')!.applied).toBe(false)
    expect(r.breakdown.find((b) => b.criterion === 'purchase_horizon')!.detail).toContain('urgent')
  })
})

/** Un lead con todas las señales reales sembradas en sus tablas de origen. */
async function seedFullLead(org: TenantFixture, suffix: string) {
  const [contact] = await db.insert(schema.contacts).values({ organizationId: org.orgId, name: `María ${suffix}`, createdAt: ts, updatedAt: ts }).returning()
  const [lead] = await db
    .insert(schema.leads)
    .values({ organizationId: org.orgId, name: `María ${suffix}`, source: 'web', status: 'new', stage: 'new', score: 0, contactId: contact.id, createdAt: ts, updatedAt: ts })
    .returning()
  const [requirement] = await db
    .insert(schema.buyerRequirements)
    .values({ organizationId: org.orgId, contactId: contact.id, title: 'Piso', status: 'active', operation: 'sale', budgetValidated: 1, desiredDate: '2026-08-01', mortgageStatus: 'approved', createdAt: ts, updatedAt: ts })
    .returning()
  await db.insert(schema.visits).values({
    organizationId: org.orgId,
    clientName: `María ${suffix}`,
    agentId: org.teamMemberId,
    agentName: 'Comercial',
    scheduledAt: '2026-06-12 17:00:00',
    status: 'scheduled',
    type: 'property_viewing',
    leadId: lead.id,
    createdAt: ts,
  })
  const [channel] = await db
    .insert(schema.commsChannels)
    .values({ organizationId: org.orgId, provider: 'meta_cloud', label: 'Meta', phoneE164: `+3491${suffix.length}000000`, externalPhoneId: `9${org.orgId}000${suffix.length}`, credentialsCiphertext: 'x', credentialsIv: 'y', status: 'active', isDefault: 1, createdAt: ts, updatedAt: ts })
    .returning()
  const [commsContact] = await db.insert(schema.commsContacts).values({ organizationId: org.orgId, phoneE164: `+3460000${org.orgId}${suffix.length}`, leadId: lead.id, createdAt: ts, updatedAt: ts }).returning()
  const [conv] = await db.insert(schema.commsConversations).values({ organizationId: org.orgId, channelId: channel.id, contactId: commsContact.id, createdAt: ts, updatedAt: ts }).returning()
  await db.insert(schema.commsMessages).values({ organizationId: org.orgId, conversationId: conv.id, direction: 'in', type: 'text', body: 'Hola', status: 'received', createdAt: '2026-06-10 08:00:00', updatedAt: '2026-06-10 08:00:00' })
  for (const propertyId of [org.projectId, 999001, 999002]) {
    await db.insert(schema.commsMessages).values({
      organizationId: org.orgId,
      conversationId: conv.id,
      direction: 'out',
      type: 'property_share',
      body: 'Ficha',
      status: 'read',
      propertyId,
      propertyKind: 'developer',
      readAt: '2026-06-09 19:00:00',
      createdAt: '2026-06-09 18:00:00',
      updatedAt: '2026-06-09 19:00:00',
    })
  }
  return { contact, lead, requirement }
}

describe('recomputeLeadScore (señales reales en D1)', () => {
  it('lee las señales de sus tablas de origen, guarda proyección + historial con las reglas usadas, y sólo escribe historial si algo cambia', async () => {
    const { lead, requirement } = await seedFullLead(a, 'Alpha')

    const first = await recomputeLeadScore(db, a.orgId, lead.id, 'manual', NOW)
    expect(first!.score).toBe(84)
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.score).toBe(84)
    expect(row.scoreComputedAt).toBe('2026-06-10 12:00:00')
    expect(row.scoreExpiresAt).toBe('2026-06-11 08:00:00')

    // Sin cambios: no hay fila nueva de historial.
    await recomputeLeadScore(db, a.orgId, lead.id, 'manual', NOW)
    let snaps = await db.select().from(schema.leadScoreSnapshots).where(eq(schema.leadScoreSnapshots.leadId, lead.id))
    expect(snaps).toHaveLength(1)
    expect(JSON.parse(snaps[0].rulesJson)).toEqual(defaultLeadScoreRules())

    // §136: la financiación deja de estar aprobada → 74, con su fila de historial.
    await db.update(schema.buyerRequirements).set({ mortgageStatus: 'required' }).where(eq(schema.buyerRequirements.id, requirement.id))
    const second = await recomputeLeadScore(db, a.orgId, lead.id, 'signal', NOW)
    expect(second!.score).toBe(74)
    snaps = await db.select().from(schema.leadScoreSnapshots).where(eq(schema.leadScoreSnapshots.leadId, lead.id))
    expect(snaps.map((s: any) => s.score)).toEqual([84, 74])

    const detail = await getLeadScoreDetail(db, a.orgId, lead.id)
    expect(detail!.score).toBe(74)
    expect(detail!.history.map((h: any) => h.score)).toEqual([74, 84])
    expect(detail!.breakdown!.find((x) => x.criterion === 'financing_validated')!.applied).toBe(false)
  })

  it('el cron sólo recalcula los leads cuya señal temporal caducó', async () => {
    const { lead } = await seedFullLead(a, 'Expiry')
    await recomputeLeadScore(db, a.orgId, lead.id, 'manual', NOW)
    expect(await recomputeExpiredLeadScores(db, a.orgId, NOW)).toBe(0)
    const nextDay = Date.parse('2026-06-11T09:00:00Z')
    expect(await recomputeExpiredLeadScores(db, a.orgId, nextDay)).toBe(1)
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.score).toBe(69)
  })

  it('reglas por agencia: cambiar puntos o desactivar un criterio sólo afecta a esa agencia', async () => {
    const { lead } = await seedFullLead(a, 'RulesA')
    const { lead: leadB } = await seedFullLead(b, 'RulesB')
    await saveLeadScoreRules(db, a.orgId, [
      { criterion: 'viewing_requested', points: 30 },
      { criterion: 'opened_listings', enabled: false },
    ])
    expect((await recomputeLeadScore(db, a.orgId, lead.id, 'rules', NOW))!.score).toBe(90)
    expect((await recomputeLeadScore(db, b.orgId, leadB.id, 'rules', NOW))!.score).toBe(84)
    const rulesA = await getLeadScoreRules(db, a.orgId)
    expect(rulesA.find((r) => r.criterion === 'viewing_requested')!.points).toBe(30)
    expect((await getLeadScoreRules(db, b.orgId)).find((r) => r.criterion === 'viewing_requested')!.points).toBe(20)
  })

  it('rechaza criterios desconocidos y valores fuera de rango (nunca guarda una regla que el motor no sepa evaluar)', async () => {
    await expect(saveLeadScoreRules(db, a.orgId, [{ criterion: 'ai_magic' } as any])).rejects.toMatchObject({ statusCode: 422 })
    await expect(saveLeadScoreRules(db, a.orgId, [{ criterion: 'budget_validated', points: 500 }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(saveLeadScoreRules(db, a.orgId, [{ criterion: 'purchase_horizon', config: { withinDays: 0 } }])).rejects.toMatchObject({ statusCode: 422 })
    await expect(saveLeadScoreRules(db, a.orgId, [{ criterion: 'financing_validated', config: { statuses: ['por_la_cara'] } }])).rejects.toMatchObject({ statusCode: 422 })
  })

  it('aislamiento: un lead de otra agencia no se recalcula ni se lee, y sus mensajes no cuentan', async () => {
    const { lead: leadB } = await seedFullLead(b, 'Iso')
    expect(await recomputeLeadScore(db, a.orgId, leadB.id, 'manual', NOW)).toBeNull()
    expect(await getLeadScoreDetail(db, a.orgId, leadB.id)).toBeNull()
    const [row] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadB.id), eq(schema.leads.organizationId, b.orgId)))
    expect(row.scoreComputedAt).toBeNull()
  })

  it('una puntuación heredada (sin desglose) se enseña como tal hasta recalcularla — nunca se inventa un historial', async () => {
    const [legacy] = await db
      .insert(schema.leads)
      .values({ organizationId: a.orgId, name: 'Heredado', source: 'web', status: 'new', stage: 'new', score: 55, createdAt: ts, updatedAt: ts })
      .returning()
    const before = await getLeadScoreDetail(db, a.orgId, legacy.id)
    expect(before).toMatchObject({ score: 55, breakdown: null, computedAt: null, history: [] })
    const after = await recomputeLeadScore(db, a.orgId, legacy.id, 'rules', NOW)
    expect(after!.score).toBe(0)
    expect((await getLeadScoreDetail(db, a.orgId, legacy.id))!.history).toHaveLength(1)
  })
})

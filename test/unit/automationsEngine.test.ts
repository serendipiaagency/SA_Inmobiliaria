import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Bloque N8b — motor de automatizaciones (FASE 34). Base real (sqlite-proxy +
 * migraciones reales, incluida la 0009 que sembró las filas de demostración).
 * Se prueba lo que importa de verdad: que un evento real dispara, que las
 * condiciones filtran, que la acción es real (una tarea de verdad, un cambio
 * de etapa con historial…), que todo queda registrado, que una desactivada no
 * ejecuta, que nada cruza de agencia y que la acción usa los permisos de
 * quien la configuró.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const { createAutomation, updateAutomation, automationDetail } = await import('../../server/utils/automations/service')
const { runAutomationsForOrg } = await import('../../server/utils/automations/engine')
const { recordActivity } = await import('../../server/utils/activity/service')

let db: any
let a: TenantFixture
let b: TenantFixture
const ts = '2026-01-01 00:00:00'

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'AutoAlpha')
  b = await seedTenant(db, 'AutoBeta')
})

const admin = (f: TenantFixture, permissions: string[] | null = null) => ({ id: f.userId, name: 'Admin', email: 'a@example.com', role: 'admin', organizationId: f.orgId, permissions: permissions ? JSON.stringify(permissions) : null })
const run = (orgId: number, automationId?: number) => runAutomationsForOrg(db, orgId, { event: { context: { db }, node: { req: { headers: {} } } }, env: {}, automationId })

/** Un lead nuevo de verdad: la fila y su evento LEAD_CREATED en Actividad (lo que hace upsertLead). */
async function newLead(f: TenantFixture, over: Record<string, any> = {}) {
  const [lead] = await db
    .insert(schema.leads)
    .values({ organizationId: f.orgId, name: over.name ?? 'Lucía Prado', email: `l${Math.random()}@example.com`, source: over.source ?? 'web', status: 'new', stage: 'new', score: 0, agentId: over.agentId ?? null, createdAt: ts, updatedAt: ts })
    .returning()
  await recordActivity(db, f.orgId, { eventType: 'LEAD_CREATED', entityType: 'lead', entityId: lead.id, leadId: lead.id, actorType: 'system', metadata: { source: lead.source } })
  return lead
}

const followUp = { name: 'Llamar a cada lead nuevo', trigger: 'lead.created', action: 'create_task', config: { title: 'Llamar a {{nombre}}', type: 'call', dueInHours: 2, assignee: 'lead_commercial' } }

async function tasksOf(orgId: number) {
  return db.select().from(schema.tasks).where(eq(schema.tasks.organizationId, orgId))
}
async function runsOf(automationId: number) {
  return db.select().from(schema.workflowRuns).where(eq(schema.workflowRuns.automationId, automationId))
}

describe('disparo, acción real y registro', () => {
  it('lead creado → crea una tarea real ligada al lead, con su comercial; registra la ejecución y cuenta 1', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), followUp)
    expect(auto).toMatchObject({ engine: 'v1', enabled: 1, createdBy: a.userId })
    const lead = await newLead(a, { name: 'Lucía Prado', agentId: a.teamMemberId })

    const summary = await run(a.orgId)
    expect(summary).toMatchObject({ automations: 1, events: 1, ok: 1, error: 0 })

    const tasks = await tasksOf(a.orgId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ title: 'Llamar a Lucía Prado', type: 'call', leadId: lead.id, assigneeId: a.teamMemberId, status: 'open' })
    // La tarea pasó por el servicio real: Actividad y próxima acción del lead.
    const acts = await db.select().from(schema.activities).where(and(eq(schema.activities.entityType, 'task'), eq(schema.activities.entityId, tasks[0].id)))
    expect(acts.map((x: any) => x.eventType)).toContain('TASK_CREATED')

    const runs = await runsOf(auto.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ kind: 'automation', status: 'ok', trigger: 'lead.created', eventKey: expect.stringMatching(/^activity:\d+$/), entityType: 'lead', entityId: lead.id, executedAs: a.userId })
    const [after] = await db.select().from(schema.automations).where(eq(schema.automations.id, auto.id))
    expect(after.runsCount).toBe(1)
    expect(after.lastRunAt).toBeTruthy()

    // La traza de Domain Tools dice de dónde vino.
    const trace = await db.select().from(schema.domainToolCalls).where(eq(schema.domainToolCalls.organizationId, a.orgId))
    expect(trace.some((t: any) => t.tool === 'create_task' && t.source === 'automation' && t.status === 'ok')).toBe(true)

    // Otra pasada no repite: el cursor avanzó y el evento ya está reclamado.
    expect(await run(a.orgId)).toMatchObject({ events: 0 })
    expect(await tasksOf(a.orgId)).toHaveLength(1)

    // La ficha trae el registro.
    const detail = await automationDetail(db, a.orgId, after)
    expect(detail.runs[0]).toMatchObject({ status: 'ok', entityId: lead.id })
    expect(detail.row).toMatchObject({ triggerLabel: 'Lead creado', actionLabel: 'Crear tarea', legacy: false })
  })

  it('lo que pasó antes de crearla no la dispara', async () => {
    await newLead(a)
    await createAutomation(db, a.orgId, admin(a), followUp)
    expect(await run(a.orgId)).toMatchObject({ events: 0 })
    expect(await tasksOf(a.orgId)).toHaveLength(0)
  })

  it('cambio de etapa → otra etapa por el pipeline real (historial como «Sistema», sin contar como respuesta humana)', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), {
      name: 'Cualificado → visita',
      trigger: 'lead.stage_changed',
      action: 'change_lead_stage',
      conditions: [{ field: 'stage.to', op: 'eq', value: 'qualified' }],
      config: { stage: 'viewing' },
    })
    const lead = await newLead(a)
    await db.insert(schema.leadStageHistory).values({ organizationId: a.orgId, leadId: lead.id, userId: a.userId, fromStage: 'new', toStage: 'contacted', createdAt: ts })
    await db.insert(schema.leadStageHistory).values({ organizationId: a.orgId, leadId: lead.id, userId: a.userId, fromStage: 'contacted', toStage: 'qualified', createdAt: ts })
    await db.update(schema.leads).set({ stage: 'qualified' }).where(eq(schema.leads.id, lead.id))

    const s = await run(a.orgId)
    expect(s).toMatchObject({ events: 2, ok: 1, skipped: 1 })
    const [after] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(after.stage).toBe('viewing')
    expect(after.firstResponseAt).toBeNull()
    const history = await db.select().from(schema.leadStageHistory).where(eq(schema.leadStageHistory.leadId, lead.id))
    expect(history.at(-1)).toMatchObject({ toStage: 'viewing', userId: null, reason: 'Automatización «Cualificado → visita»' })
    const runs = await runsOf(auto.id)
    expect(runs.find((r: any) => r.status === 'skipped').message).toMatch(/Etapa nueva/)
  })

  it('notificar al equipo y anotar: aviso en la campana y nota con origen «automation»', async () => {
    await createAutomation(db, a.orgId, admin(a), { name: 'Aviso', trigger: 'lead.created', action: 'notify_team', config: { message: 'Nuevo lead: {{nombre}}' } })
    await createAutomation(db, a.orgId, admin(a), { name: 'Nota', trigger: 'lead.created', action: 'create_note', config: { body: 'Entró por {{evento}}' } })
    const lead = await newLead(a, { name: 'Mario Gil' })
    expect(await run(a.orgId)).toMatchObject({ ok: 2 })
    const notes = await db.select().from(schema.notes).where(eq(schema.notes.leadId, lead.id))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ body: 'Entró por Lead creado', source: 'automation', organizationId: a.orgId })
    const bell = await db.select().from(schema.publicationNotifications).where(eq(schema.publicationNotifications.organizationId, a.orgId))
    expect(bell.map((n: any) => n.message)).toContain('Nuevo lead: Mario Gil')
  })

  it('lead sin atender (alerta de SLA) y tarea vencida (sólo las que vencen después de activarla, una vez)', async () => {
    const unattended = await createAutomation(db, a.orgId, admin(a), { name: 'Reasignar sin atender', trigger: 'lead.unattended', action: 'assign_lead', config: { commercialId: a.teamMemberId } })
    const lead = await newLead(a)
    await db.insert(schema.leadSlaAlerts).values({ organizationId: a.orgId, leadId: lead.id, type: 'unattended', status: 'open', openedAt: ts, createdAt: ts })
    const overdue = await createAutomation(db, a.orgId, admin(a), { name: 'Vencidas', trigger: 'task.overdue', action: 'notify_team', config: { message: 'Tarea vencida #{{id}}' } })
    // activa desde 2026-01-01: una de antes no cuenta, una de después (ya vencida) sí.
    await db.update(schema.automations).set({ activeSince: '2026-01-01 00:00:00' }).where(eq(schema.automations.id, overdue.id))
    const [old] = await db.insert(schema.tasks).values({ organizationId: a.orgId, type: 'call', title: 'Vieja', dueAt: '2025-12-01 10:00:00', status: 'open', createdAt: ts, updatedAt: ts }).returning()
    const [late] = await db.insert(schema.tasks).values({ organizationId: a.orgId, type: 'call', title: 'Vencida', dueAt: '2026-02-01 10:00:00', status: 'open', createdAt: ts, updatedAt: ts }).returning()

    expect(await run(a.orgId)).toMatchObject({ ok: 2 })
    const [assigned] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(assigned.agentId).toBe(a.teamMemberId)
    expect((await runsOf(unattended.id))[0]).toMatchObject({ eventKey: expect.stringMatching(/^sla_alert:/), status: 'ok' })
    const overdueRuns = await runsOf(overdue.id)
    expect(overdueRuns.map((r: any) => r.eventKey)).toEqual([`task:${late.id}`])
    expect(overdueRuns.map((r: any) => r.eventKey)).not.toContain(`task:${old.id}`)
    expect(await run(a.orgId)).toMatchObject({ events: 0 })
  })
})

describe('condiciones', () => {
  it('sólo dispara si se cumplen TODAS; si no, queda registrada como «no aplica» con el motivo', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), { ...followUp, conditions: [{ field: 'lead.source', op: 'in', value: ['portal', 'ads'] }, { field: 'lead.commercial', op: 'empty' }] })
    await newLead(a, { source: 'web' })
    await newLead(a, { source: 'portal', agentId: a.teamMemberId })
    const target = await newLead(a, { source: 'portal' })
    expect(await run(a.orgId)).toMatchObject({ events: 3, ok: 1, skipped: 2 })
    const tasks = await tasksOf(a.orgId)
    expect(tasks.map((t: any) => t.leadId)).toEqual([target.id])
    const skipped = (await runsOf(auto.id)).filter((r: any) => r.status === 'skipped')
    expect(skipped.map((r: any) => r.message)).toEqual([expect.stringMatching(/Origen del lead \(web\)/), expect.stringMatching(/Comercial del lead/)])
  })

  it('valida el catálogo: campo que no aplica al disparador, valor fuera de lista o acción inexistente → 422', async () => {
    await expect(createAutomation(db, a.orgId, admin(a), { ...followUp, conditions: [{ field: 'task.type', op: 'eq', value: 'call' }] })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createAutomation(db, a.orgId, admin(a), { ...followUp, conditions: [{ field: 'lead.source', op: 'eq', value: 'paloma' }] })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createAutomation(db, a.orgId, admin(a), { ...followUp, action: 'send_email' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(createAutomation(db, a.orgId, admin(a), { ...followUp, trigger: 'reservation.confirmed' })).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('activar / desactivar', () => {
  it('desactivada no ejecuta nada; al reactivarla no recupera lo que pasó mientras estaba apagada', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), followUp)
    const off = await updateAutomation(db, a.orgId, admin(a), auto, { enabled: false })
    expect(off.enabled).toBe(0)
    await newLead(a)
    expect(await run(a.orgId)).toMatchObject({ automations: 0, events: 0 })
    expect(await tasksOf(a.orgId)).toHaveLength(0)

    await updateAutomation(db, a.orgId, admin(a), off, { enabled: true })
    expect(await run(a.orgId)).toMatchObject({ automations: 1, events: 0 })
    const fresh = await newLead(a)
    expect(await run(a.orgId)).toMatchObject({ ok: 1 })
    expect((await tasksOf(a.orgId)).map((t: any) => t.leadId)).toEqual([fresh.id])
  })

  it('las filas de demostración sembradas por 0009 no se ejecutan, no se activan y no suman en ningún contador', async () => {
    const legacy = await db.select().from(schema.automations).where(eq(schema.automations.organizationId, 1))
    expect(legacy.length).toBeGreaterThan(0)
    expect(legacy.every((r: any) => r.engine === 'legacy')).toBe(true)
    await recordActivity(db, 1, { eventType: 'LEAD_CREATED', entityType: 'lead', entityId: 999, leadId: null, actorType: 'system' })
    expect(await run(1)).toMatchObject({ automations: 0, events: 0 })
    await expect(updateAutomation(db, 1, { ...admin(a), role: 'super_admin' }, legacy[0], { enabled: true })).rejects.toMatchObject({ statusCode: 422 })
    const { automationSummary } = await import('../../server/utils/automations/service')
    expect(await automationSummary(db, 1)).toMatchObject({ total: 0, totalRuns: 0, legacy: legacy.length })
  })
})

describe('aislamiento entre agencias y permisos', () => {
  it('una automatización de A no ve los eventos de B, y la pasada de B no ejecuta las de A', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), followUp)
    await newLead(b)
    expect(await run(a.orgId)).toMatchObject({ events: 0 })
    expect(await run(b.orgId)).toMatchObject({ automations: 0 })
    expect(await tasksOf(b.orgId)).toHaveLength(0)
    expect(await runsOf(auto.id)).toHaveLength(0)
  })

  it('referencias ajenas (comercial o responsable de otra agencia) → 404 al configurarla', async () => {
    await expect(createAutomation(db, a.orgId, admin(a), { name: 'X', trigger: 'lead.created', action: 'assign_lead', config: { commercialId: b.teamMemberId } })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAutomation(db, a.orgId, admin(a), { ...followUp, config: { ...followUp.config, assignee: 'member', assigneeId: b.teamMemberId } })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('no amplía permisos: sin crm:write no se configura (403); si quien la configuró pierde el permiso, la ejecución falla y queda registrada', async () => {
    await expect(createAutomation(db, a.orgId, admin(a, ['crm:read']), followUp)).rejects.toMatchObject({ statusCode: 403 })

    const auto = await createAutomation(db, a.orgId, admin(a), followUp)
    await db.update(schema.users).set({ permissions: JSON.stringify(['crm:read']) }).where(eq(schema.users.id, a.userId))
    await newLead(a)
    expect(await run(a.orgId)).toMatchObject({ ok: 0, error: 1 })
    expect(await tasksOf(a.orgId)).toHaveLength(0)
    const [r] = await runsOf(auto.id)
    expect(r).toMatchObject({ status: 'error', errorCode: 'PERMISSION_DENIED' })
    const [after] = await db.select().from(schema.automations).where(eq(schema.automations.id, auto.id))
    expect(after).toMatchObject({ runsCount: 1, errorCount: 1 })
    expect(after.lastError).toBeTruthy()
  })

  it('si quien la configuró ya no es de la agencia, no se ejecuta con nadie: error registrado', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), followUp)
    await db.update(schema.users).set({ organizationId: b.orgId }).where(eq(schema.users.id, a.userId))
    await newLead(a)
    expect(await run(a.orgId)).toMatchObject({ error: 1 })
    expect((await runsOf(auto.id))[0]).toMatchObject({ status: 'error', errorCode: 'PERMISSION_DENIED' })
    expect(await tasksOf(a.orgId)).toHaveLength(0)
  })

  it('freno contra bucles: como mucho 5 ejecuciones por ficha y automatización en 24 h', async () => {
    const auto = await createAutomation(db, a.orgId, admin(a), { name: 'Aviso', trigger: 'lead.stage_changed', action: 'notify_team', config: { message: 'Cambio' } })
    const lead = await newLead(a)
    for (let i = 0; i < 7; i++) await db.insert(schema.leadStageHistory).values({ organizationId: a.orgId, leadId: lead.id, fromStage: 'new', toStage: 'contacted', createdAt: ts })
    expect(await run(a.orgId)).toMatchObject({ ok: 5, skipped: 2 })
    expect((await runsOf(auto.id)).filter((r: any) => r.status === 'skipped')[0].message).toMatch(/Freno de seguridad/)
  })
})

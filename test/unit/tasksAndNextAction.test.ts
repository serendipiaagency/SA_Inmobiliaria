import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { eq, and } from 'drizzle-orm'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * FASE 22 — Task + Next Action, migración 0077.
 *
 * Dos bloques: el servicio de Tareas en sí (crear/actualizar/listar,
 * TASK_CREATED/TASK_COMPLETED en Activity), y `syncLeadNextAction()` — que
 * `leads.nextActionAt`/`nextActionType` sean de verdad una proyección
 * sincronizada de la Task abierta o la Appointment futura más próxima de un
 * lead, nunca un dato suelto, tanto al crear como al completar/cancelar.
 */

const ts = '2026-01-01 00:00:00'
let seq = 0

async function seedCommercial(db: any, orgId: number, name: string) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name, slug: `task-comercial-${seq}`, email: `task-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

async function seedContact(db: any, orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, status: 'active', createdAt: ts, updatedAt: ts }).returning()
  return row
}

async function seedLead(db: any, orgId: number, overrides: Record<string, any> = {}) {
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: 'Lead Task', source: 'web', status: 'active', stage: 'qualified', score: 10, createdAt: ts, updatedAt: ts, ...overrides })
    .returning()
  return row
}

describe('FASE 22 — TaskService', () => {
  it('crea una tarea, registra TASK_CREATED, y aparece al listar por sus relaciones', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TaskHappy')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const contact = await seedContact(db, fixture.orgId, 'Contacto Task')
    const { createTask } = await import('../../server/utils/tasks/service')
    const { listActivity } = await import('../../server/utils/activity/service')

    const task = await createTask(db, fixture.orgId, { type: 'call', title: 'Llamar para feedback', assigneeId: laura.id, dueAt: '2026-02-01 10:00:00', contactId: contact.id }, { createdBy: fixture.userId })

    expect(task.status).toBe('open')
    expect(task.priority).toBe('medium')

    const { rows } = await listActivity(db, fixture.orgId, { contactId: contact.id })
    expect(rows.map((r) => r.eventType)).toContain('TASK_CREATED')
  })

  it('rechaza un tipo o una prioridad no reconocidos, y un título vacío', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TaskInvalid')
    const { createTask } = await import('../../server/utils/tasks/service')

    await expect(createTask(db, fixture.orgId, { type: 'not_a_type' as any, title: 'X' })).rejects.toThrow(/Tipo de tarea/)
    await expect(createTask(db, fixture.orgId, { type: 'call', title: '   ' })).rejects.toThrow(/título/)
    await expect(createTask(db, fixture.orgId, { type: 'call', title: 'X', priority: 'nuclear' as any })).rejects.toThrow(/Prioridad/)
  })

  it('completar una tarea fija completedAt, registra TASK_COMPLETED una sola vez, y listTasks(overdue) deja de incluirla', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'TaskComplete')
    const { createTask, updateTask, listTasks } = await import('../../server/utils/tasks/service')

    const task = await createTask(db, fixture.orgId, { type: 'call', title: 'Vencida', dueAt: '2020-01-01 00:00:00' })
    const overdueBefore = await listTasks(db, fixture.orgId, { overdue: true })
    expect(overdueBefore.some((t) => t.id === task.id)).toBe(true)

    const completed = await updateTask(db, fixture.orgId, task.id, { status: 'completed' }, { actorId: fixture.userId })
    expect(completed.completedAt).toBeTruthy()

    // Completar de nuevo (idempotente desde la UI) no debe generar un segundo TASK_COMPLETED.
    await updateTask(db, fixture.orgId, task.id, { status: 'completed' }, { actorId: fixture.userId })
    const taskCompletedCount = (await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, fixture.orgId), eq(schema.activities.eventType, 'TASK_COMPLETED'), eq(schema.activities.entityId, task.id)))).length
    expect(taskCompletedCount).toBe(1)

    const overdueAfter = await listTasks(db, fixture.orgId, { overdue: true })
    expect(overdueAfter.some((t) => t.id === task.id)).toBe(false)
  })

  it('aislamiento entre tenants: listTasks de una organización no ve las tareas de otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'TaskTenantA')
    const b = await seedTenant(db, 'TaskTenantB')
    const { createTask, listTasks } = await import('../../server/utils/tasks/service')

    await createTask(db, a.orgId, { type: 'call', title: 'Sólo de A' })
    const rowsB = await listTasks(db, b.orgId, {})
    expect(rowsB).toHaveLength(0)
  })
})

describe('FASE 22 — syncLeadNextAction: proyección, nunca un dato suelto', () => {
  it('una Task abierta con dueAt fija next_action_at/next_action_type del lead', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'NextActionTask')
    const lead = await seedLead(db, fixture.orgId)
    const { createTask } = await import('../../server/utils/tasks/service')

    await createTask(db, fixture.orgId, { type: 'call', title: 'Llamar', dueAt: '2026-05-01 10:00:00', leadId: lead.id })

    const [row] = await db.select({ nextActionAt: schema.leads.nextActionAt, nextActionType: schema.leads.nextActionType }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBe('2026-05-01 10:00:00')
    expect(row.nextActionType).toBe('task:call')
  })

  it('entre una Task y una Appointment futuras, gana la más próxima', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'NextActionEarliest')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const lead = await seedLead(db, fixture.orgId)
    const { createTask } = await import('../../server/utils/tasks/service')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await createTask(db, fixture.orgId, { type: 'call', title: 'Llamar', dueAt: '2027-06-10 10:00:00', leadId: lead.id })
    await createAdminAppointment(db, fixture.orgId, { clientName: 'Cliente', clientEmail: 'x@example.com', agentId: laura.id, scheduledAt: '2027-06-05 09:00:00', leadId: lead.id })

    const [row] = await db.select({ nextActionAt: schema.leads.nextActionAt, nextActionType: schema.leads.nextActionType }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBe('2027-06-05 09:00:00')
    expect(row.nextActionType).toBe('appointment:property_viewing')
  })

  it('completar la Task recalcula: si sólo queda la Appointment, pasa a ser la próxima acción', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'NextActionRecalc')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const lead = await seedLead(db, fixture.orgId)
    const { createTask, updateTask } = await import('../../server/utils/tasks/service')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    const task = await createTask(db, fixture.orgId, { type: 'call', title: 'Llamar', dueAt: '2027-06-01 10:00:00', leadId: lead.id })
    await createAdminAppointment(db, fixture.orgId, { clientName: 'Cliente', clientEmail: 'x@example.com', agentId: laura.id, scheduledAt: '2027-06-10 09:00:00', leadId: lead.id })

    await updateTask(db, fixture.orgId, task.id, { status: 'completed' })

    const [row] = await db.select({ nextActionAt: schema.leads.nextActionAt, nextActionType: schema.leads.nextActionType }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBe('2027-06-10 09:00:00')
    expect(row.nextActionType).toBe('appointment:property_viewing')
  })

  it('sin ninguna Task con fecha ni Appointment futura, queda en null — no inventa una acción', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'NextActionNone')
    const lead = await seedLead(db, fixture.orgId)
    const { createTask } = await import('../../server/utils/tasks/service')

    // Una tarea SIN dueAt no cuenta: no hay con qué ordenarla junto a una cita real.
    await createTask(db, fixture.orgId, { type: 'call', title: 'Algún día', leadId: lead.id })

    const [row] = await db.select({ nextActionAt: schema.leads.nextActionAt, nextActionType: schema.leads.nextActionType }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBeNull()
    expect(row.nextActionType).toBeNull()
  })

  it('cancelar la cita que era la próxima acción la limpia si no queda nada más', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'NextActionCancelClears')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const lead = await seedLead(db, fixture.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { syncLeadNextAction } = await import('../../server/utils/leads/nextAction')

    const visit = await createAdminAppointment(db, fixture.orgId, { clientName: 'Cliente', clientEmail: 'x@example.com', agentId: laura.id, scheduledAt: '2027-06-10 09:00:00', leadId: lead.id })
    let [row] = await db.select({ nextActionAt: schema.leads.nextActionAt }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBe('2027-06-10 09:00:00')

    await db.update(schema.visits).set({ status: 'cancelled' }).where(eq(schema.visits.id, visit.id))
    await syncLeadNextAction(db, fixture.orgId, lead.id)
    ;[row] = await db.select({ nextActionAt: schema.leads.nextActionAt }).from(schema.leads).where(eq(schema.leads.id, lead.id))
    expect(row.nextActionAt).toBeNull()
  })
})

describe('FASE 22 — VisitOutcome §56: "Seguimiento" crea una Task real', () => {
  it('recordVisitOutcome con followUp crea una Task de tipo follow_up ligada a la visita', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeFollowUp')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    const { listTasks } = await import('../../server/utils/tasks/service')

    const visit = await createAdminAppointment(db, fixture.orgId, { clientName: 'Cliente Outcome', clientEmail: 'x@example.com', agentId: laura.id, scheduledAt: '2026-02-01 10:00:00' })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, visit.id))

    await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'wants_to_think', followUp: { dueAt: '2026-02-08 10:00:00' } }, { actorId: fixture.userId })

    const tasks = await listTasks(db, fixture.orgId, { appointmentId: visit.id })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ type: 'follow_up', dueAt: '2026-02-08 10:00:00', assigneeId: laura.id })
  })

  it('sin followUp no crea ninguna tarea — no se inventa "Segunda visita"/"Oferta"/"Descartar"', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'OutcomeNoFollowUp')
    const laura = await seedCommercial(db, fixture.orgId, 'Laura')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    const { listTasks } = await import('../../server/utils/tasks/service')

    const visit = await createAdminAppointment(db, fixture.orgId, { clientName: 'Cliente Outcome 2', clientEmail: 'x2@example.com', agentId: laura.id, scheduledAt: '2026-02-01 10:00:00' })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, visit.id))

    await recordVisitOutcome(db, fixture.orgId, visit.id, { outcome: 'interested' })

    const tasks = await listTasks(db, fixture.orgId, { appointmentId: visit.id })
    expect(tasks).toHaveLength(0)
  })
})

describe('FASE 22 — cierra el círculo con la alerta SLA de FASE 16', () => {
  it('un lead cualificado con una Task abierta con fecha ya no dispara "qualified_no_action"', async () => {
    const { db } = createTestDb()
    const fixture = await seedTenant(db, 'SlaNextActionFed')
    const lead = await seedLead(db, fixture.orgId, { qualifiedAt: '2020-01-01 00:00:00' })
    const { createTask } = await import('../../server/utils/tasks/service')
    const { checkSlaForOrg } = await import('../../server/utils/leads/sla')

    await createTask(db, fixture.orgId, { type: 'call', title: 'Llamar', dueAt: '2030-01-01 00:00:00', leadId: lead.id })
    await checkSlaForOrg(db, fixture.orgId)

    const alerts = await db.select().from(schema.leadSlaAlerts).where(and(eq(schema.leadSlaAlerts.leadId, lead.id), eq(schema.leadSlaAlerts.type, 'qualified_no_action')))
    expect(alerts).toHaveLength(0)
  })
})

import { and, desc, eq, isNotNull, lt, ne } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import type { PropertyKind } from '../matching/service'

/**
 * TaskService (FASE 22) — trabajo pendiente, deliberadamente distinto de
 * Appointment (tiempo reservado) y de Activity (algo que ya ocurrió). Nunca
 * se convierte una Task en Appointment ni al revés.
 *
 * No copia datos de sus relaciones (nombre de contacto, dirección de
 * propiedad): sólo guarda los ids y los resuelve al leer, igual que
 * `activities` y `visits`.
 */

export const TASK_TYPES = ['call', 'whatsapp', 'email', 'follow_up', 'document', 'viewing', 'offer', 'signature', 'other'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface CreateTaskInput {
  type: TaskType
  title: string
  assigneeId?: number | null
  dueAt?: string | null
  priority?: TaskPriority
  contactId?: number | null
  leadId?: number | null
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  appointmentId?: number | null
  dealId?: number | null
}

export interface TaskRow {
  id: number
  organizationId: number
  type: string
  title: string
  assigneeId: number | null
  dueAt: string | null
  priority: string
  status: string
  contactId: number | null
  leadId: number | null
  propertyId: number | null
  propertyKind: string | null
  appointmentId: number | null
  dealId: number | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

function validate(input: CreateTaskInput) {
  if (!(TASK_TYPES as readonly string[]).includes(input.type)) throw createError({ statusCode: 422, statusMessage: 'Tipo de tarea inválido' })
  if (!input.title?.trim()) throw createError({ statusCode: 422, statusMessage: 'El título es obligatorio' })
  if (input.priority && !(TASK_PRIORITIES as readonly string[]).includes(input.priority)) throw createError({ statusCode: 422, statusMessage: 'Prioridad inválida' })
}

async function belongsToOrg(db: any, table: any, id: number, orgId: number): Promise<boolean> {
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
  return rows.length > 0
}

/**
 * Cada id que referencia una Task tiene que ser de ESTA organización. Antes
 * sólo se guardaba el número: una tarea podía apuntar al lead, contacto o
 * comercial de otra agencia (y la vista Tareas resuelve nombres por id). Sin
 * catálogo explícito, la propiedad vale si existe en cualquiera de los dos
 * catálogos de la organización — el mismo criterio que ya seguían las filas
 * guardadas sin `propertyKind`.
 */
export async function assertTaskReferences(db: any, orgId: number, refs: Pick<CreateTaskInput, 'assigneeId' | 'contactId' | 'leadId' | 'propertyId' | 'propertyKind' | 'appointmentId' | 'dealId'>) {
  const missing = (what: string) => createError({ statusCode: 404, statusMessage: `${what} no encontrado en esta organización` })
  if (refs.assigneeId && !(await belongsToOrg(db, schema.teamMembers, refs.assigneeId, orgId))) throw missing('Responsable')
  if (refs.contactId && !(await belongsToOrg(db, schema.contacts, refs.contactId, orgId))) throw missing('Contacto')
  if (refs.leadId && !(await belongsToOrg(db, schema.leads, refs.leadId, orgId))) throw missing('Lead')
  if (refs.appointmentId && !(await belongsToOrg(db, schema.visits, refs.appointmentId, orgId))) throw missing('Cita')
  if (refs.dealId && !(await belongsToOrg(db, schema.dealOperations, refs.dealId, orgId))) throw missing('Operación')
  if (refs.propertyId) {
    const tables = refs.propertyKind === 'agent' ? [schema.agentProperties] : refs.propertyKind === 'developer' ? [schema.developerProperties] : [schema.developerProperties, schema.agentProperties]
    let found = false
    for (const t of tables) if (!found && (await belongsToOrg(db, t, refs.propertyId, orgId))) found = true
    if (!found) throw missing('Inmueble')
  }
}

/** Crea una Task y registra TASK_CREATED. Si queda ligada a un lead, recalcula su próxima acción. */
export async function createTask(db: any, orgId: number, input: CreateTaskInput, opts: { createdBy?: number | null } = {}): Promise<TaskRow> {
  validate(input)
  await assertTaskReferences(db, orgId, input)
  const nowTs = now()
  const [row] = await db
    .insert(schema.tasks)
    .values({
      organizationId: orgId,
      type: input.type,
      title: input.title.trim(),
      assigneeId: input.assigneeId ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? 'medium',
      status: 'open',
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      propertyId: input.propertyId ?? null,
      propertyKind: input.propertyKind ?? null,
      appointmentId: input.appointmentId ?? null,
      dealId: input.dealId ?? null,
      createdBy: opts.createdBy ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await recordActivity(db, orgId, {
    eventType: 'TASK_CREATED',
    entityType: 'task',
    entityId: row.id,
    contactId: row.contactId,
    leadId: row.leadId,
    propertyId: row.propertyId,
    propertyKind: row.propertyKind as PropertyKind | null,
    appointmentId: row.appointmentId,
    actorType: opts.createdBy ? 'user' : 'system',
    actorId: opts.createdBy ?? null,
  })

  if (row.leadId) await syncLeadNextAction(db, orgId, row.leadId)
  return row
}

export interface UpdateTaskInput {
  title?: string
  type?: TaskType
  assigneeId?: number | null
  dueAt?: string | null
  priority?: TaskPriority
  status?: TaskStatus
}

/** Actualiza una Task. Completar/cancelar recalcula la próxima acción del lead si tiene uno; completar registra TASK_COMPLETED. */
export async function updateTask(db: any, orgId: number, taskId: number, input: UpdateTaskInput, opts: { actorId?: number | null } = {}): Promise<TaskRow> {
  const rows = await db.select().from(schema.tasks).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId))).limit(1)
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Tarea no encontrada' })

  if (input.type !== undefined && !(TASK_TYPES as readonly string[]).includes(input.type)) throw createError({ statusCode: 422, statusMessage: 'Tipo de tarea inválido' })
  if (input.priority !== undefined && !(TASK_PRIORITIES as readonly string[]).includes(input.priority)) throw createError({ statusCode: 422, statusMessage: 'Prioridad inválida' })
  if (input.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(input.status)) throw createError({ statusCode: 422, statusMessage: 'Estado inválido' })
  if (input.title !== undefined && !input.title.trim()) throw createError({ statusCode: 422, statusMessage: 'El título es obligatorio' })
  if (input.assigneeId) await assertTaskReferences(db, orgId, { assigneeId: input.assigneeId })

  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.type !== undefined) patch.type = input.type
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt
  if (input.priority !== undefined) patch.priority = input.priority

  const completing = input.status === 'completed' && existing.status !== 'completed'
  if (input.status !== undefined) {
    patch.status = input.status
    patch.completedAt = input.status === 'completed' ? nowTs : null
  }

  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, taskId))
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1)

  if (completing) {
    await recordActivity(db, orgId, {
      eventType: 'TASK_COMPLETED',
      entityType: 'task',
      entityId: row.id,
      contactId: row.contactId,
      leadId: row.leadId,
      propertyId: row.propertyId,
      propertyKind: row.propertyKind as PropertyKind | null,
      appointmentId: row.appointmentId,
      actorType: opts.actorId ? 'user' : 'system',
      actorId: opts.actorId ?? null,
    })
  }

  // Cualquier cambio de estado, fecha o si sigue abierta puede cambiar cuál es la próxima acción del lead.
  if (row.leadId && (input.status !== undefined || input.dueAt !== undefined)) await syncLeadNextAction(db, orgId, row.leadId)
  return row
}

export interface ListTasksFilter {
  assigneeId?: number
  status?: TaskStatus
  type?: TaskType
  priority?: TaskPriority
  contactId?: number
  leadId?: number
  propertyId?: number
  propertyKind?: PropertyKind
  appointmentId?: number
  dealId?: number
  /** Abiertas/en curso con dueAt vencido. */
  overdue?: boolean
  /** dueAt dentro de hoy (00:00–23:59 UTC). */
  dueToday?: boolean
}

/** Lista tareas de la organización, más próximas primero (dueAt asc, nulls al final). Sin filtro alguno, lee todas las de la org — a propósito: es la vista "Tareas" del panel, no la cronología de una entidad. */
export async function listTasks(db: any, orgId: number, filter: ListTasksFilter = {}): Promise<TaskRow[]> {
  const nowTs = now()
  const today = nowTs.slice(0, 10)
  const conditions = [eq(schema.tasks.organizationId, orgId)]
  if (filter.assigneeId) conditions.push(eq(schema.tasks.assigneeId, filter.assigneeId))
  if (filter.status) conditions.push(eq(schema.tasks.status, filter.status))
  if (filter.type) conditions.push(eq(schema.tasks.type, filter.type))
  if (filter.priority) conditions.push(eq(schema.tasks.priority, filter.priority))
  if (filter.contactId) conditions.push(eq(schema.tasks.contactId, filter.contactId))
  if (filter.leadId) conditions.push(eq(schema.tasks.leadId, filter.leadId))
  if (filter.propertyId) {
    conditions.push(eq(schema.tasks.propertyId, filter.propertyId))
    if (filter.propertyKind) conditions.push(eq(schema.tasks.propertyKind, filter.propertyKind))
  }
  if (filter.appointmentId) conditions.push(eq(schema.tasks.appointmentId, filter.appointmentId))
  if (filter.dealId) conditions.push(eq(schema.tasks.dealId, filter.dealId))
  if (filter.overdue) {
    conditions.push(ne(schema.tasks.status, 'completed'), ne(schema.tasks.status, 'cancelled'), isNotNull(schema.tasks.dueAt), lt(schema.tasks.dueAt, nowTs))
  }
  if (filter.dueToday) {
    conditions.push(isNotNull(schema.tasks.dueAt))
    // Comparación por prefijo de fecha (YYYY-MM-DD): mismo formato de fecha en todo el proyecto, sin zona horaria propia.
  }

  const rows: TaskRow[] = await db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(desc(schema.tasks.dueAt))

  const filtered = filter.dueToday ? rows.filter((r) => r.dueAt && r.dueAt.slice(0, 10) === today) : rows
  // dueAt asc con NULLs al final: SQLite ordena NULL primero de forma nativa, así que se ordena aquí en vez de en SQL.
  return [...filtered].sort((a, b) => {
    if (a.dueAt === b.dueAt) return b.id - a.id
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt < b.dueAt ? -1 : 1
  })
}

/** Derivado, nunca guardado: una Task vencida es open/in_progress con dueAt en el pasado. */
export function isTaskOverdue(task: Pick<TaskRow, 'status' | 'dueAt'>, nowTs: string = now()): boolean {
  return (task.status === 'open' || task.status === 'in_progress') && !!task.dueAt && task.dueAt < nowTs
}

import { and, desc, eq, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { now } from '../db'
import { recordActivity } from '../activity/service'
import { syncLeadNextAction } from '../leads/nextAction'
import type { PropertyKind } from '../matching/service'
import { propertyState, trashedPropertyMessage, type PropertyState } from '../properties/trash'
import { contactNames, leadNames, propertyNameOf, propertyNames, teamMemberNames, visitLabels } from '../crm/labels'
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../../../utils/pipelineCatalog'

/**
 * TaskService (FASE 22) — trabajo pendiente, deliberadamente distinto de
 * Appointment (tiempo reservado) y de Activity (algo que ya ocurrió). Nunca
 * se convierte una Task en Appointment ni al revés.
 *
 * No copia datos de sus relaciones (nombre de contacto, dirección de
 * propiedad): sólo guarda los ids y los resuelve al leer, igual que
 * `activities` y `visits`.
 */

// Los valores válidos (y su etiqueta) viven en el catálogo compartido con el panel.
export { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES }
export type TaskType = (typeof TASK_TYPES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface CreateTaskInput {
  type: TaskType
  title: string
  assigneeId?: number | null
  dueAt?: string | null
  priority?: TaskPriority
  /** Una tarea nace abierta o, si ya se ha empezado, en curso — nunca completada ni cancelada. */
  status?: 'open' | 'in_progress'
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
  deletedAt?: string | null
}

/** Una tarea con los nombres de lo que referencia ya resueltos (sólo lectura, para el panel). */
export interface TaskWithLabels extends TaskRow {
  assigneeName: string | null
  contactName: string | null
  leadName: string | null
  propertyName: string | null
  appointmentLabel: string | null
}

function validate(input: CreateTaskInput) {
  if (!(TASK_TYPES as readonly string[]).includes(input.type)) throw createError({ statusCode: 422, statusMessage: 'Tipo de tarea inválido' })
  if (!input.title?.trim()) throw createError({ statusCode: 422, statusMessage: 'El título es obligatorio' })
  if (input.priority && !(TASK_PRIORITIES as readonly string[]).includes(input.priority)) throw createError({ statusCode: 422, statusMessage: 'Prioridad inválida' })
  if (input.status && input.status !== 'open' && input.status !== 'in_progress') throw createError({ statusCode: 422, statusMessage: 'Una tarea nueva sólo puede estar abierta o en curso' })
  if (input.propertyKind != null && input.propertyKind !== 'agent' && input.propertyKind !== 'developer') throw createError({ statusCode: 422, statusMessage: 'Catálogo de inmueble no válido' })
}

async function belongsToOrg(db: any, table: any, id: number, orgId: number): Promise<boolean> {
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId))).limit(1)
  return rows.length > 0
}

/** Como `belongsToOrg`, pero una fila borrada (`deletedAt`) tampoco vale: no se cuelga trabajo nuevo de algo borrado. */
async function liveInOrg(db: any, table: any, id: number, orgId: number): Promise<boolean> {
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.organizationId, orgId), isNull(table.deletedAt))).limit(1)
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
export async function assertTaskReferences(
  db: any,
  orgId: number,
  refs: Pick<CreateTaskInput, 'assigneeId' | 'contactId' | 'leadId' | 'propertyId' | 'propertyKind' | 'appointmentId' | 'dealId'>,
  opts: { allowTrashedProperty?: boolean } = {},
) {
  const missing = (what: string) => createError({ statusCode: 404, statusMessage: `${what} no encontrado en esta organización` })
  if (refs.assigneeId && !(await belongsToOrg(db, schema.teamMembers, refs.assigneeId, orgId))) throw missing('Responsable')
  if (refs.contactId && !(await belongsToOrg(db, schema.contacts, refs.contactId, orgId))) throw missing('Contacto')
  if (refs.leadId && !(await belongsToOrg(db, schema.leads, refs.leadId, orgId))) throw missing('Lead')
  if (refs.appointmentId && !(await liveInOrg(db, schema.visits, refs.appointmentId, orgId))) throw missing('Cita')
  if (refs.dealId && !(await liveInOrg(db, schema.dealOperations, refs.dealId, orgId))) throw missing('Operación')
  if (refs.propertyId) {
    const kinds: PropertyKind[] = refs.propertyKind === 'agent' ? ['agent'] : refs.propertyKind === 'developer' ? ['developer'] : ['developer', 'agent']
    const states: PropertyState[] = []
    for (const kind of kinds) states.push(await propertyState(db, orgId, kind, refs.propertyId))
    if (states.every((st) => st === 'missing')) throw missing('Inmueble')
    // Una tarea NUEVA sobre una propiedad en la papelera no se crea — salvo
    // cuando la propiedad viene heredada de algo que ya existía (el
    // seguimiento de una visita ya hecha, appointments/outcome.ts): eso es
    // historia, no trabajo nuevo sobre el catálogo.
    if (!states.includes('live') && !opts.allowTrashedProperty) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('crearle una tarea') })
  }
}

/** Crea una Task y registra TASK_CREATED. Si queda ligada a un lead, recalcula su próxima acción. */
export async function createTask(db: any, orgId: number, input: CreateTaskInput, opts: { createdBy?: number | null; allowTrashedProperty?: boolean } = {}): Promise<TaskRow> {
  validate(input)
  await assertTaskReferences(db, orgId, input, { allowTrashedProperty: opts.allowTrashedProperty })
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
      status: input.status ?? 'open',
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
  // Bloque N6 (FASE 22): las relaciones también se editan — `null` desvincula.
  contactId?: number | null
  leadId?: number | null
  propertyId?: number | null
  propertyKind?: PropertyKind | null
  appointmentId?: number | null
  dealId?: number | null
}

async function getLiveTaskOrThrow(db: any, orgId: number, taskId: number): Promise<TaskRow> {
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId), isNull(schema.tasks.deletedAt)))
    .limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Tarea no encontrada' })
  return rows[0]
}

/**
 * Edita una Task — todos sus campos, incluido el estado (`in_progress`
 * también) y sus relaciones. Cada relación nueva se valida en la
 * organización (404 si es ajena o no existe); cambiar la propiedad a una de
 * la papelera es trabajo nuevo sobre ella (422), pero conservar la que ya
 * tenía —aunque se haya borrado después— es historia y se permite.
 *
 * Completar registra TASK_COMPLETED y cancelar TASK_CANCELLED. Cualquier
 * cambio que pueda mover la próxima acción de un lead (estado, fecha, tipo o
 * el propio lead) la recalcula — del lead anterior y del nuevo.
 */
export async function updateTask(db: any, orgId: number, taskId: number, input: UpdateTaskInput, opts: { actorId?: number | null } = {}): Promise<TaskRow> {
  const existing = await getLiveTaskOrThrow(db, orgId, taskId)

  if (input.type !== undefined && !(TASK_TYPES as readonly string[]).includes(input.type)) throw createError({ statusCode: 422, statusMessage: 'Tipo de tarea inválido' })
  if (input.priority !== undefined && !(TASK_PRIORITIES as readonly string[]).includes(input.priority)) throw createError({ statusCode: 422, statusMessage: 'Prioridad inválida' })
  if (input.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(input.status)) throw createError({ statusCode: 422, statusMessage: 'Estado inválido' })
  if (input.title !== undefined && !input.title.trim()) throw createError({ statusCode: 422, statusMessage: 'El título es obligatorio' })
  if (input.propertyKind != null && input.propertyKind !== 'agent' && input.propertyKind !== 'developer') throw createError({ statusCode: 422, statusMessage: 'Catálogo de inmueble no válido' })

  // Sólo se valida lo que cambia: una referencia que ya tenía la tarea no se
  // vuelve a juzgar (p. ej. una cita que después se borró sigue siendo historia).
  const changed = <K extends keyof UpdateTaskInput>(k: K) => input[k] !== undefined && (input[k] ?? null) !== ((existing as any)[k] ?? null)
  const refs: Parameters<typeof assertTaskReferences>[2] = {}
  if (changed('assigneeId')) refs.assigneeId = input.assigneeId
  if (changed('contactId')) refs.contactId = input.contactId
  if (changed('leadId')) refs.leadId = input.leadId
  if (changed('appointmentId')) refs.appointmentId = input.appointmentId
  if (changed('dealId')) refs.dealId = input.dealId
  const nextPropertyId = input.propertyId !== undefined ? input.propertyId : existing.propertyId
  const nextPropertyKind = input.propertyKind !== undefined ? input.propertyKind : (existing.propertyKind as PropertyKind | null)
  const propertyChanged = (nextPropertyId ?? null) !== (existing.propertyId ?? null) || (nextPropertyId != null && (nextPropertyKind ?? null) !== (existing.propertyKind ?? null))
  if (propertyChanged && nextPropertyId) {
    refs.propertyId = nextPropertyId
    refs.propertyKind = nextPropertyKind
  }
  await assertTaskReferences(db, orgId, refs)

  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.type !== undefined) patch.type = input.type
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt
  if (input.priority !== undefined) patch.priority = input.priority
  if (input.contactId !== undefined) patch.contactId = input.contactId
  if (input.leadId !== undefined) patch.leadId = input.leadId
  if (input.appointmentId !== undefined) patch.appointmentId = input.appointmentId
  if (input.dealId !== undefined) patch.dealId = input.dealId
  if (input.propertyId !== undefined || input.propertyKind !== undefined) {
    patch.propertyId = nextPropertyId ?? null
    patch.propertyKind = nextPropertyId ? (nextPropertyKind ?? null) : null
  }

  const completing = input.status === 'completed' && existing.status !== 'completed'
  const cancelling = input.status === 'cancelled' && existing.status !== 'cancelled'
  if (input.status !== undefined) {
    patch.status = input.status
    patch.completedAt = input.status === 'completed' ? (existing.status === 'completed' ? existing.completedAt : nowTs) : null
  }

  await db.update(schema.tasks).set(patch).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)))
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1)

  if (completing || cancelling) {
    await recordActivity(db, orgId, {
      eventType: completing ? 'TASK_COMPLETED' : 'TASK_CANCELLED',
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

  // Cualquier cambio de estado, fecha, tipo o lead puede cambiar cuál es la próxima acción (del lead anterior y del nuevo).
  if (input.status !== undefined || input.dueAt !== undefined || input.type !== undefined || input.leadId !== undefined) {
    const leadIds = new Set<number>([existing.leadId, row.leadId].filter((v): v is number => !!v))
    for (const leadId of leadIds) await syncLeadNextAction(db, orgId, leadId)
  }
  return row
}

/**
 * Borra una Task a la papelera (`deletedAt`, migración 0086): desaparece de
 * los listados, de la ficha de la operación y del cálculo de la próxima
 * acción, pero la fila —y su Activity— se conservan. No se borra nada de
 * verdad: el TASK_CREATED/TASK_COMPLETED que ya ocurrió sigue en la
 * cronología.
 */
export async function deleteTask(db: any, orgId: number, taskId: number): Promise<TaskRow> {
  const existing = await getLiveTaskOrThrow(db, orgId, taskId)
  const nowTs = now()
  await db.update(schema.tasks).set({ deletedAt: nowTs, updatedAt: nowTs }).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, orgId)))
  if (existing.leadId) await syncLeadNextAction(db, orgId, existing.leadId)
  return { ...existing, deletedAt: nowTs, updatedAt: nowTs }
}

/** `active` = abiertas o en curso: el trabajo que sigue pendiente. */
export type TaskStatusFilter = TaskStatus | 'active'

export interface ListTasksFilter {
  assigneeId?: number
  status?: TaskStatusFilter
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

/** Lista tareas de la organización (nunca las de la papelera), más próximas primero (dueAt asc, nulls al final). Sin filtro alguno, lee todas las de la org — a propósito: es la vista "Tareas" del panel, no la cronología de una entidad. */
export async function listTasks(db: any, orgId: number, filter: ListTasksFilter = {}): Promise<TaskRow[]> {
  const nowTs = now()
  const today = nowTs.slice(0, 10)
  const conditions = [eq(schema.tasks.organizationId, orgId), isNull(schema.tasks.deletedAt)]
  if (filter.assigneeId) conditions.push(eq(schema.tasks.assigneeId, filter.assigneeId))
  if (filter.status === 'active') conditions.push(inArray(schema.tasks.status, ['open', 'in_progress']))
  else if (filter.status) conditions.push(eq(schema.tasks.status, filter.status))
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

/** Añade a cada tarea el nombre de su responsable, contacto, lead, inmueble y cita — resueltos dentro de la organización. */
export async function withTaskLabels(db: any, orgId: number, rows: TaskRow[]): Promise<TaskWithLabels[]> {
  const [assignees, contacts, leads, properties, visits] = await Promise.all([
    teamMemberNames(db, orgId, rows.map((r) => r.assigneeId)),
    contactNames(db, orgId, rows.map((r) => r.contactId)),
    leadNames(db, orgId, rows.map((r) => r.leadId)),
    propertyNames(db, orgId, rows.map((r) => ({ id: r.propertyId, kind: r.propertyKind }))),
    visitLabels(db, orgId, rows.map((r) => r.appointmentId)),
  ])
  return rows.map((r) => ({
    ...r,
    assigneeName: r.assigneeId ? (assignees.get(r.assigneeId) ?? null) : null,
    contactName: r.contactId ? (contacts.get(r.contactId) ?? null) : null,
    leadName: r.leadId ? (leads.get(r.leadId) ?? null) : null,
    propertyName: propertyNameOf(properties, r.propertyId, r.propertyKind),
    appointmentLabel: r.appointmentId ? (visits.get(r.appointmentId) ?? null) : null,
  }))
}

/** Derivado, nunca guardado: una Task vencida es open/in_progress con dueAt en el pasado. */
export function isTaskOverdue(task: Pick<TaskRow, 'status' | 'dueAt'>, nowTs: string = now()): boolean {
  return (task.status === 'open' || task.status === 'in_progress') && !!task.dueAt && task.dueAt < nowTs
}

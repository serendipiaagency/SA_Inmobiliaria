import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listTasks, withTaskLabels, TASK_PRIORITIES, TASK_TYPES, type ListTasksFilter, type TaskStatusFilter, type TaskType, type TaskPriority } from '../../../utils/tasks/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * GET /api/admin/saas/tasks — la vista "Tareas" (FASE 22). Sin filtros lee
 * todas las de la organización, como Calendar/Visitas: RBAC en este proyecto
 * es por área (`crm`), nunca por fila, así que no existe un "sólo las mías"
 * a nivel de servidor — el filtro `assigneeId` es lo que la pantalla usa
 * para acotar por comercial, igual que el filtro "Comercial" de Calendar.
 *
 * Bloque N6: `status=active` (abiertas + en curso); las tareas de la
 * papelera nunca salen; cada fila trae ya el nombre de su responsable,
 * contacto, lead, inmueble y cita (resueltos dentro de la organización).
 */
const STATUS_FILTERS: TaskStatusFilter[] = ['open', 'in_progress', 'completed', 'cancelled', 'active']

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListTasksFilter = {}
  if (q.assigneeId) filter.assigneeId = Number(q.assigneeId)
  if (q.status && STATUS_FILTERS.includes(q.status as TaskStatusFilter)) filter.status = q.status as TaskStatusFilter
  if (q.type && (TASK_TYPES as readonly string[]).includes(String(q.type))) filter.type = q.type as TaskType
  if (q.priority && (TASK_PRIORITIES as readonly string[]).includes(String(q.priority))) filter.priority = q.priority as TaskPriority
  if (q.contactId) filter.contactId = Number(q.contactId)
  if (q.leadId) filter.leadId = Number(q.leadId)
  if (q.propertyId) {
    filter.propertyId = Number(q.propertyId)
    filter.propertyKind = (PROPERTY_KINDS as string[]).includes(String(q.propertyKind)) ? (q.propertyKind as PropertyKind) : 'developer'
  }
  if (q.appointmentId) filter.appointmentId = Number(q.appointmentId)
  if (q.dealId) filter.dealId = Number(q.dealId)
  if (q.overdue === '1' || q.overdue === 'true') filter.overdue = true
  if (q.dueToday === '1' || q.dueToday === 'true') filter.dueToday = true

  const rows = await withTaskLabels(db, orgId, await listTasks(db, orgId, filter))
  return { rows }
})

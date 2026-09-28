import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listTasks, type ListTasksFilter, type TaskStatus, type TaskType, type TaskPriority } from '../../../utils/tasks/service'
import { PROPERTY_KINDS, type PropertyKind } from '../../../utils/matching/service'

/**
 * GET /api/admin/saas/tasks — la vista "Tareas" (FASE 22). Sin filtros lee
 * todas las de la organización, como Calendar/Visitas: RBAC en este proyecto
 * es por área (`crm`), nunca por fila, así que no existe un "sólo las mías"
 * a nivel de servidor — el filtro `assigneeId` es lo que la pantalla usa
 * para acotar por comercial, igual que el filtro "Comercial" de Calendar.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const q = getQuery(event)

  const filter: ListTasksFilter = {}
  if (q.assigneeId) filter.assigneeId = Number(q.assigneeId)
  if (q.status && (['open', 'in_progress', 'completed', 'cancelled'] as TaskStatus[]).includes(q.status as TaskStatus)) filter.status = q.status as TaskStatus
  if (q.type) filter.type = q.type as TaskType
  if (q.priority) filter.priority = q.priority as TaskPriority
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

  const rows = await listTasks(db, orgId, filter)
  return { rows }
})

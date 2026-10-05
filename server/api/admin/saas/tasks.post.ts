import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { createTask, type CreateTaskInput } from '../../../utils/tasks/service'
import { logAdminAction } from '../../../utils/audit'

/** POST /api/admin/saas/tasks — crear una tarea (FASE 22), desde la ficha de Cliente, Leads, el resultado de una visita o la propia pantalla de Tareas (que ya permite elegir contacto, lead, propiedad, cita y operación — cada una validada en la organización). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = (await readBody<CreateTaskInput>(event)) || ({} as CreateTaskInput)

  const task = await createTask(
    db,
    orgId,
    {
      type: body.type,
      title: body.title,
      assigneeId: body.assigneeId ? Number(body.assigneeId) : null,
      dueAt: body.dueAt || null,
      priority: body.priority,
      status: body.status,
      contactId: body.contactId ? Number(body.contactId) : null,
      leadId: body.leadId ? Number(body.leadId) : null,
      propertyId: body.propertyId ? Number(body.propertyId) : null,
      propertyKind: body.propertyKind || null,
      appointmentId: body.appointmentId ? Number(body.appointmentId) : null,
      dealId: body.dealId ? Number(body.dealId) : null,
    },
    { createdBy: user.id },
  )

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'task', resourceId: task.id })
  return task
})

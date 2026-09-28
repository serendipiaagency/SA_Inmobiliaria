import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { updateTask, type UpdateTaskInput } from '../../../../utils/tasks/service'
import { logAdminAction } from '../../../../utils/audit'

/** PATCH /api/admin/saas/tasks/:id — editar, reasignar, o cambiar de estado (incluye completar/cancelar) una tarea. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const taskId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(taskId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const body = (await readBody<UpdateTaskInput & { assigneeId?: number | null }>(event)) || {}

  const patch: UpdateTaskInput = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.type !== undefined) patch.type = body.type
  if (body.assigneeId !== undefined) patch.assigneeId = body.assigneeId === null ? null : Number(body.assigneeId)
  if (body.dueAt !== undefined) patch.dueAt = body.dueAt
  if (body.priority !== undefined) patch.priority = body.priority
  if (body.status !== undefined) patch.status = body.status

  const task = await updateTask(db, orgId, taskId, patch, { actorId: user.id })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'task', resourceId: taskId })
  return task
})

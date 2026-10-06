import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { deleteTask, restoreTask, updateTask, type UpdateTaskInput } from '../../../../utils/tasks/service'
import { logAdminAction } from '../../../../utils/audit'
import type { PropertyKind } from '../../../../utils/matching/service'

type PatchBody = Record<keyof UpdateTaskInput, any> & {
  /**
   * `true` manda la tarea a la papelera (borrado lógico, `deletedAt`); `false`
   * la restaura (cierre C1). No hay ruta DELETE ni /restore propias: el
   * presupuesto de rutas de Nitro está agotado.
   */
  deleted?: boolean
}

/** Un id opcional del cuerpo: `undefined` = no tocar, `null`/'' = desvincular, número = vincular. */
function idOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw createError({ statusCode: 422, statusMessage: 'Identificador no válido' })
  return n
}

/**
 * PATCH /api/admin/saas/tasks/:id — editar cualquier campo de una tarea
 * (tipo, título, responsable, fecha, prioridad, estado —también «en curso»—
 * y sus relaciones: contacto, lead, propiedad, cita y operación; y su
 * oficina, cierre D3a), o
 * mandarla a la papelera con `{ deleted: true }` y sacarla de ella con
 * `{ deleted: false }` (cierre C1). Las dos dejan su evento en la actividad
 * (TASK_TRASHED / TASK_RESTORED) con quién lo hizo.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const taskId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(taskId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const body = (await readBody<Partial<PatchBody>>(event)) || {}

  if (body.deleted === true) {
    const task = await deleteTask(db, orgId, taskId, { actorId: user.id })
    await logAdminAction(event, { user, orgId, action: 'delete', resource: 'task', resourceId: taskId, detail: 'papelera' })
    return task
  }
  if (body.deleted === false) {
    const task = await restoreTask(db, orgId, taskId, { actorId: user.id })
    await logAdminAction(event, { user, orgId, action: 'restore', resource: 'task', resourceId: taskId })
    return task
  }

  const patch: UpdateTaskInput = {}
  if (body.title !== undefined) patch.title = String(body.title ?? '')
  if (body.type !== undefined) patch.type = body.type
  if (body.assigneeId !== undefined) patch.assigneeId = idOrNull(body.assigneeId)
  if (body.dueAt !== undefined) patch.dueAt = body.dueAt || null
  if (body.priority !== undefined) patch.priority = body.priority
  if (body.status !== undefined) patch.status = body.status
  if (body.contactId !== undefined) patch.contactId = idOrNull(body.contactId)
  if (body.leadId !== undefined) patch.leadId = idOrNull(body.leadId)
  if (body.propertyId !== undefined) patch.propertyId = idOrNull(body.propertyId)
  if (body.propertyKind !== undefined) patch.propertyKind = (body.propertyKind || null) as PropertyKind | null
  if (body.appointmentId !== undefined) patch.appointmentId = idOrNull(body.appointmentId)
  if (body.dealId !== undefined) patch.dealId = idOrNull(body.dealId)
  // Cierre D3a: la oficina de la tarea (`null`/'' = la de su responsable).
  if (body.officeId !== undefined) patch.officeId = idOrNull(body.officeId)

  const task = await updateTask(db, orgId, taskId, patch, { actorId: user.id })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'task', resourceId: taskId })
  return task
})

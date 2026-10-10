import { requireSuperAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { deleteDemoRequests, updateDemoRequest } from '../../../utils/demoRequests'

/**
 * PATCH /api/admin/demo-requests — atender una solicitud de demo (sólo super admin).
 *   { id, status?, notes? }            cambia el estado y/o las notas internas
 *   { action: 'delete', ids: [...] }   la borra (a petición de la persona, RGPD)
 * Queda en la auditoría del panel con quién lo hizo.
 */
export default defineEventHandler(async (event) => {
  const user = await requireSuperAdmin(event)
  const body = await readBody<Record<string, any>>(event)
  const db = useDb(event)

  if (body?.action === 'delete') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    if (!ids.length) throw createError({ statusCode: 422, statusMessage: 'ids requeridos' })
    const deleted = await deleteDemoRequests(db, ids)
    await logAdminAction(event, { user, orgId: null, action: 'delete', resource: 'demo_requests', resourceId: ids.join(','), detail: `${deleted} solicitud(es) de demo borrada(s)` })
    return { ok: true, deleted }
  }

  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'id requerido' })
  const patch: { status?: string; notes?: string | null } = {}
  if (typeof body.status === 'string') patch.status = body.status
  if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes)
  if (!Object.keys(patch).length) throw createError({ statusCode: 422, statusMessage: 'Nada que cambiar' })
  const found = await updateDemoRequest(db, id, patch)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Solicitud no encontrada' })
  await logAdminAction(event, { user, orgId: null, action: 'update', resource: 'demo_requests', resourceId: id, detail: patch.status ? `estado → ${patch.status}` : 'notas' })
  return { ok: true }
})

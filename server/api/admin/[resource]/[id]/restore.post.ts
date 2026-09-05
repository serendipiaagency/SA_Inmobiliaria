import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../../utils/auth'
import { getResource } from '../../../../utils/adminResources'
import { logAdminAction } from '../../../../utils/audit'
import { authorizeRecord, buildTenantWhere } from '../../../../utils/tenantPolicy'

/** Restores a soft-deleted row from Papelera. Only valid for softDelete resources. */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (!def.softDelete) throw createError({ statusCode: 400, statusMessage: 'This resource has no Papelera' })
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'write'))
  }
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  await db.update(def.table).set({ deletedAt: null }).where(where as any)
  await logAdminAction(event, { user, orgId, action: 'restore', resource: key, resourceId: id })
  return { ok: true }
})

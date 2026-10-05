import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../../utils/auth'
import { getResource, rethrowUniqueViolation } from '../../../../utils/adminResources'
import { logAdminAction } from '../../../../utils/audit'
import { authorizeRecord, buildTenantWhere } from '../../../../utils/tenantPolicy'
import { restoreDocumentFile } from '../../../../utils/properties/documents'
import { restorePropertyMediaFile, syncMediaKeyVisibility } from '../../../../utils/properties/media'

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

  const { row } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
  // Un documento o recurso multimedia restaurado recupera su fichero — salvo
  // que el cron ya lo haya purgado (409, y la fila se queda en la papelera).
  if (key === 'property-documents') await restoreDocumentFile(db, orgId!, row)
  if (key === 'property-media') await restorePropertyMediaFile(db, orgId!, row as { r2Key: string | null })

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  // Restaurar puede chocar con un registro vivo del mismo nombre (índice único parcial): 409 legible.
  // Un contacto restaurado vuelve a estar activo (una fusión lo dejó «archivado»).
  const restored: Record<string, unknown> = key === 'contacts' ? { deletedAt: null, status: 'active' } : { deletedAt: null }
  await db.update(def.table).set(restored).where(where as any).catch(rethrowUniqueViolation)
  if (key === 'property-media' && (row as any).r2Key) await syncMediaKeyVisibility(db, orgId!, (row as any).r2Key)
  await logAdminAction(event, { user, orgId, action: 'restore', resource: key, resourceId: id })
  return { ok: true }
})

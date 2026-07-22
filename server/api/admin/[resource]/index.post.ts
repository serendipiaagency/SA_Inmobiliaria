import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event))
  }
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, true)
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }
  // Tenant ownership is always server-resolved, never taken from client input.
  if (def.orgScoped !== false && orgId != null) data.organizationId = orgId
  const inserted = await db.insert(def.table).values(data).returning({ id: def.table.id })
  const id = inserted[0]?.id
  await syncTranslations(db, def, id, body?.translations)
  return { ok: true, id }
})

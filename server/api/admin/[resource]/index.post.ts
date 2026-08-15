import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations, assertPayloadReferences } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { authorizeRecord } from '../../../utils/tenantPolicy'

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
  // Tenant ownership is always server-resolved, never taken from client input —
  // for direct-policy resources it's the org column, for child resources it's
  // the parent FK, which must point at a row this tenant already owns.
  delete data.organizationId
  await assertPayloadReferences(db, def, data, orgId, { isCreate: true })
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }
  if (def.tenantPolicy.type === 'direct' && orgId != null) {
    data[def.tenantPolicy.organizationField ?? 'organizationId'] = orgId
  }
  const inserted = await db.insert(def.table).values(data).returning({ id: def.table.id })
  const id = inserted[0]?.id

  if (def.translations && Array.isArray(body?.translations)) {
    const { authorized } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
    await syncTranslations(db, def, authorized, body.translations)
  }
  await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: id })
  return { ok: true, id }
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { now, schema, useDb } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { getCommsSettings } from '../../../utils/comms/inbox'

/** PUT /api/admin/comms/settings — prefijo por defecto, política con desconocidos, avisos internos. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const body = (await readBody(event)) || {}
  const patch: Record<string, any> = { updatedAt: now() }

  if ('defaultCountryPrefix' in body) {
    const raw = String(body.defaultCountryPrefix || '').trim()
    if (raw && !/^\+[1-9]\d{0,3}$/.test(raw)) throw createError({ statusCode: 422, statusMessage: 'El prefijo debe ser como +34.' })
    patch.defaultCountryPrefix = raw || null
  }
  if ('unknownContactPolicy' in body) {
    if (!['ask', 'lead'].includes(String(body.unknownContactPolicy))) throw createError({ statusCode: 422, statusMessage: 'Política no válida.' })
    patch.unknownContactPolicy = String(body.unknownContactPolicy)
  }
  if ('notifyInternal' in body) patch.notifyInternal = body.notifyInternal ? 1 : 0

  const db = useDb(event)
  const existing = await db.select({ organizationId: schema.commsSettings.organizationId }).from(schema.commsSettings).where(eq(schema.commsSettings.organizationId, orgId)).limit(1)
  if (existing[0]) await db.update(schema.commsSettings).set(patch).where(eq(schema.commsSettings.organizationId, orgId))
  else await db.insert(schema.commsSettings).values({ organizationId: orgId, createdAt: now(), ...patch })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-settings', resourceId: orgId })
  return getCommsSettings(db, orgId)
})

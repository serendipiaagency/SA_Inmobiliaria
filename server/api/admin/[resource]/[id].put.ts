import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
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
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, false)
  delete data.organizationId // tenant ownership can't be reassigned via this endpoint
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }

  const idCond = eq(def.table.id, id)
  const orgCond = def.orgScoped !== false && orgId != null ? eq(def.table.organizationId, orgId) : undefined
  const where = orgCond ? and(idCond, orgCond) : idCond

  // Off-plan project prices are chartable on the public property page — every
  // real edit here becomes a real data point, never a fabricated one.
  if (key === 'developer-properties' && typeof data.price === 'number') {
    const current = await db.select({ price: schema.developerProperties.price }).from(schema.developerProperties).where(where as any).limit(1)
    if (current[0] && current[0].price !== data.price) {
      await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, recordedAt: new Date().toISOString() })
    }
  }

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(where as any)
  }
  await syncTranslations(db, def, id, body?.translations)
  return { ok: true, id }
})

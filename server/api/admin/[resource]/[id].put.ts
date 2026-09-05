import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations, assertPayloadReferences } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { fireAutomationRules } from '../../../utils/publication/automations'
import { authorizeRecord, buildTenantWhere } from '../../../utils/tenantPolicy'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'write'))
  }
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // Resolve-then-act: every later step (including translation sync) works from
  // a record this tenant has been proven to own, instead of from a raw URL id.
  const { row: existing, authorized } = await authorizeRecord(db, {
    resourceKey: key,
    table: def.table,
    policy: def.tenantPolicy,
    id,
    orgId,
  })

  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, false, event)
  delete data.organizationId // tenant ownership can't be reassigned via this endpoint
  // Re-validate any FK the payload touches: an update must not be able to
  // re-parent this row onto another tenant's record.
  await assertPayloadReferences(db, def, data, orgId, { isCreate: false })
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }
  // Same reasoning as the role guard above, for the RBAC areas themselves —
  // only when the value actually changes, so a non-super_admin editing any
  // other field of a user (name, role, …) doesn't trip this on the
  // untouched `permissions` value that round-trips through the edit form.
  if (key === 'users' && 'permissions' in data && data.permissions !== (existing as any).permissions && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can change permissions' })
  }

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  // Off-plan project prices are chartable on the public property page — every
  // real edit here becomes a real data point, never a fabricated one.
  // Also the two hooks for the Publication Scheduler's automation rules
  // (Fase 11): a real price drop or status change here can fire a rule that
  // re-publishes the property across its configured channels — see
  // server/utils/publication/automations.ts.
  let automationsFired = 0
  if (key === 'developer-properties') {
    if (typeof data.price === 'number' && existing.price !== data.price) {
      await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, recordedAt: new Date().toISOString() })
      if (data.price < existing.price) {
        automationsFired += await fireAutomationRules(db, orgId!, id, 'price_drop', `precio ${existing.price} → ${data.price}`)
      }
    }
    if (typeof data.status === 'string' && existing.status !== data.status) {
      automationsFired += await fireAutomationRules(db, orgId!, id, 'status_change', `estado ${existing.status} → ${data.status}`)
    }
  }

  // The public article's comment_count only reflects visible (approved) comments —
  // moderating one into/out of "approved" here must keep that counter honest.
  // The article is reached through this comment's own (tenant-verified) row, and
  // `relations.articleId` guarantees it belongs to the same tenant.
  if (key === 'cms-comments' && typeof data.status === 'string' && existing.status !== data.status) {
    const articleId = data.articleId ?? existing.articleId
    const wasApproved = existing.status === 'approved'
    const nowApproved = data.status === 'approved'
    const articleWhere = and(eq(schema.cmsArticles.id, articleId), eq(schema.cmsArticles.organizationId, orgId!))
    if (!wasApproved && nowApproved) {
      await db.update(schema.cmsArticles).set({ commentCount: sql`${schema.cmsArticles.commentCount} + 1` }).where(articleWhere)
    } else if (wasApproved && !nowApproved) {
      await db.update(schema.cmsArticles).set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` }).where(articleWhere)
    }
  }

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(where as any)
  }
  await syncTranslations(db, def, authorized, body?.translations)
  await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id })
  return { ok: true, id, automationsFired: automationsFired || undefined }
})

import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { fireAutomationRules } from '../../../utils/publication/automations'

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
  // Also the two hooks for the Publication Scheduler's automation rules
  // (Fase 11): a real price drop or status change here can fire a rule that
  // re-publishes the property across its configured channels — see
  // server/utils/publication/automations.ts.
  let automationsFired = 0
  if (key === 'developer-properties') {
    const current = await db
      .select({ price: schema.developerProperties.price, status: schema.developerProperties.status })
      .from(schema.developerProperties)
      .where(where as any)
      .limit(1)
    if (current[0]) {
      if (typeof data.price === 'number' && current[0].price !== data.price) {
        await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, recordedAt: new Date().toISOString() })
        if (data.price < current[0].price) {
          automationsFired += await fireAutomationRules(db, orgId!, id, 'price_drop', `precio ${current[0].price} → ${data.price}`)
        }
      }
      if (typeof data.status === 'string' && current[0].status !== data.status) {
        automationsFired += await fireAutomationRules(db, orgId!, id, 'status_change', `estado ${current[0].status} → ${data.status}`)
      }
    }
  }

  // The public article's comment_count only reflects visible (approved) comments —
  // moderating one into/out of "approved" here must keep that counter honest.
  if (key === 'cms-comments' && typeof data.status === 'string') {
    const current = await db.select({ status: schema.cmsComments.status, articleId: schema.cmsComments.articleId }).from(schema.cmsComments).where(where as any).limit(1)
    if (current[0] && current[0].status !== data.status) {
      const wasApproved = current[0].status === 'approved'
      const nowApproved = data.status === 'approved'
      if (!wasApproved && nowApproved) {
        await db.update(schema.cmsArticles).set({ commentCount: sql`${schema.cmsArticles.commentCount} + 1` }).where(eq(schema.cmsArticles.id, current[0].articleId))
      } else if (wasApproved && !nowApproved) {
        await db.update(schema.cmsArticles).set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` }).where(eq(schema.cmsArticles.id, current[0].articleId))
      }
    }
  }

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(where as any)
  }
  await syncTranslations(db, def, id, body?.translations)
  await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id })
  return { ok: true, id, automationsFired: automationsFired || undefined }
})

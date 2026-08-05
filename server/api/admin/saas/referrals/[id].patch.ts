import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { dispatchWebhook } from '../../../../utils/webhooks'

const VALID_STATUSES = ['pending', 'converted', 'rewarded', 'expired'] as const

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const referral = (await db.select().from(schema.referrals).where(eq(schema.referrals.id, id)).limit(1))[0]
  if (!referral || referral.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Referral not found' })

  const body = await readBody<{ status?: string }>(event)
  if (!body?.status || !VALID_STATUSES.includes(body.status as any)) throw createError({ statusCode: 422, statusMessage: 'Invalid status' })

  const patch: Record<string, unknown> = { status: body.status }
  const nowTs = now()
  if (body.status === 'converted') patch.convertedAt = nowTs
  if (body.status === 'rewarded') patch.rewardedAt = nowTs

  await db.update(schema.referrals).set(patch).where(eq(schema.referrals.id, id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'referral', resourceId: id })
  if (body.status === 'converted') await dispatchWebhook(event, orgId, 'referral.converted', { id, refereeName: referral.refereeName })

  return (await db.select().from(schema.referrals).where(eq(schema.referrals.id, id)).limit(1))[0]
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema, now } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'

/** Marks a deal's commission as paid (or reverses that) — the only mutation a closed deal needs day-to-day. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const deal = (await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1))[0]
  if (!deal || deal.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Deal not found' })

  const body = await readBody<{ commissionPaid?: boolean }>(event)
  if (body?.commissionPaid === undefined) throw createError({ statusCode: 422, statusMessage: 'commissionPaid is required' })

  await db
    .update(schema.deals)
    .set({ commissionPaid: body.commissionPaid ? 1 : 0, paidAt: body.commissionPaid ? now() : null })
    .where(eq(schema.deals.id, id))

  await logAdminAction(event, { user, orgId, action: 'update', resource: 'deal', resourceId: id })
  return (await db.select().from(schema.deals).where(eq(schema.deals.id, id)).limit(1))[0]
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, cfEnv, now } from '../../../../../utils/db'
import { retrieveCheckoutSession } from '../../../../../utils/stripe'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const deposit = (await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, id)).limit(1))[0]
  if (!deposit || deposit.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Deposit not found' })
  if (!deposit.stripeCheckoutSessionId) throw createError({ statusCode: 409, statusMessage: 'No hay sesión de Stripe asociada' })

  const result = await retrieveCheckoutSession(cfEnv(event) as any, deposit.stripeCheckoutSessionId)
  if (!result.connected) throw createError({ statusCode: 409, statusMessage: result.message })
  if (!result.ok) throw createError({ statusCode: 502, statusMessage: result.message })

  const paid = result.paymentStatus === 'paid'
  await db
    .update(schema.depositPayments)
    .set({
      status: paid ? 'paid' : 'processing',
      paidAt: paid ? now() : deposit.paidAt,
      stripePaymentIntentId: result.paymentIntentId || deposit.stripePaymentIntentId,
    })
    .where(eq(schema.depositPayments.id, id))

  return (await db.select().from(schema.depositPayments).where(eq(schema.depositPayments.id, id)).limit(1))[0]
})

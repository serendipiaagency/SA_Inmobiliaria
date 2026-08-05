import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, cfEnv, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { createDepositCheckout } from '../../../utils/stripe'

interface Body {
  contractId?: number
  amount?: number
  currency?: string
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<Body>(event)
  if (!body?.contractId) throw createError({ statusCode: 422, statusMessage: 'contractId is required' })
  if (!body?.amount || body.amount <= 0) throw createError({ statusCode: 422, statusMessage: 'amount must be greater than 0' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.id, body.contractId)).limit(1))[0]
  if (!contract || contract.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Contract not found' })

  const currency = (body.currency || 'eur').toLowerCase()
  const origin = getRequestURL(event).origin
  const result = await createDepositCheckout(cfEnv(event) as any, {
    amount: body.amount,
    currency,
    description: `Fianza — ${contract.title}`,
    successUrl: `${origin}/demo/mi-cuenta`,
    cancelUrl: `${origin}/demo/mi-cuenta`,
  })

  const nowTs = now()
  const [deposit] = await db
    .insert(schema.depositPayments)
    .values({
      organizationId: orgId,
      contractId: contract.id,
      amount: body.amount,
      currency,
      status: !result.connected ? 'not_connected' : result.ok ? 'processing' : 'failed',
      stripePaymentIntentId: result.sessionId || null,
      errorMessage: result.ok ? null : result.message,
      createdAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'deposit_payment', resourceId: deposit.id })
  return { ...deposit, checkoutUrl: result.checkoutUrl || null, message: result.message }
})

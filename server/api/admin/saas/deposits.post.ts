import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, cfEnv, now, isUniqueConstraintError } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { createDepositCheckout } from '../../../utils/stripe'

interface Body {
  contractId?: number
  amount?: number
  currency?: string
}

const DUPLICATE_MESSAGE = 'Ya hay un depósito en proceso para este contrato — espera a que se resuelva antes de crear otro.'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<Body>(event)
  if (!body?.contractId) throw createError({ statusCode: 422, statusMessage: 'contractId is required' })
  if (!body?.amount || body.amount <= 0) throw createError({ statusCode: 422, statusMessage: 'amount must be greater than 0' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.id, body.contractId)).limit(1))[0]
  if (!contract || contract.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Contract not found' })

  // Fast pre-check — avoids wasting a Stripe API call (and minting an
  // orphaned Checkout session nobody will ever see) in the common case of
  // a double-click. The real guard against two concurrent requests both
  // passing this check is deposit_payments_contract_processing (migration
  // 0051), a partial unique index on (contract_id) WHERE status =
  // 'processing' — its violation on the INSERT below is what actually
  // closes the race, same isUniqueConstraintError() pattern used for
  // visits_agent_slot_unique (migration 0050).
  const existingOpen = (
    await db
      .select({ id: schema.depositPayments.id })
      .from(schema.depositPayments)
      .where(and(eq(schema.depositPayments.contractId, contract.id), eq(schema.depositPayments.status, 'processing')))
      .limit(1)
  )[0]
  if (existingOpen) throw createError({ statusCode: 409, statusMessage: DUPLICATE_MESSAGE })

  const currency = (body.currency || 'eur').toLowerCase()
  const origin = getRequestURL(event).origin
  const result = await createDepositCheckout(cfEnv(event) as any, {
    amount: body.amount,
    currency,
    description: `Fianza — ${contract.title}`,
    successUrl: `${origin}/mi-cuenta`,
    cancelUrl: `${origin}/mi-cuenta`,
  })

  const nowTs = now()
  let deposit: typeof schema.depositPayments.$inferSelect
  try {
    ;[deposit] = await db
      .insert(schema.depositPayments)
      .values({
        organizationId: orgId,
        contractId: contract.id,
        amount: body.amount,
        currency,
        status: !result.connected ? 'not_connected' : result.ok ? 'processing' : 'failed',
        stripeCheckoutSessionId: result.sessionId || null,
        errorMessage: result.ok ? null : result.message,
        createdAt: nowTs,
      })
      .returning()
  } catch (e: any) {
    if (isUniqueConstraintError(e)) {
      throw createError({ statusCode: 409, statusMessage: DUPLICATE_MESSAGE })
    }
    throw e
  }

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'deposit_payment', resourceId: deposit.id })
  return { ...deposit, checkoutUrl: result.checkoutUrl || null, message: result.message }
})

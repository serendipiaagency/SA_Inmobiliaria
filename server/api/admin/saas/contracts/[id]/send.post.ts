import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now, cfEnv } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { sendTransactionalEmail } from '../../../../../utils/email/send'
import { getRequestId } from '../../../../../utils/requestId'

function randomToken(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)).limit(1))[0]
  if (!contract || contract.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
  if (contract.status !== 'draft') throw createError({ statusCode: 409, statusMessage: `Contract is ${contract.status}, cannot send` })

  const managementToken = contract.managementToken || randomToken()
  // Conditional on status still being 'draft' — closes the same
  // double-submit race as contracts/[token]/accept.post.ts (two clicks on
  // "send" would otherwise both pass the check above and both email the
  // client). The loser gets a 409 instead of sending a duplicate email.
  const [updated] = await db
    .update(schema.contracts)
    .set({ status: 'sent', managementToken, updatedAt: now() })
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.status, 'draft')))
    .returning({ id: schema.contracts.id })
  if (!updated) throw createError({ statusCode: 409, statusMessage: `Contract is ${contract.status}, cannot send` })
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'contract', resourceId: id })

  if (contract.clientEmail) {
    try {
      const url = `${getRequestURL(event).origin}/contratos/${managementToken}`
      await sendTransactionalEmail(db, cfEnv(event), { organizationId: orgId, template: 'contract_sent', to: contract.clientEmail, data: { title: contract.title, url }, requestId: getRequestId(event) })
    } catch {
      // The contract is already marked sent — a notification failure must never undo that.
    }
  }

  return (await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)).limit(1))[0]
})

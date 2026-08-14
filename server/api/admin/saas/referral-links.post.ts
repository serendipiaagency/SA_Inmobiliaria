import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes)
    .map((b) => b.toString(36))
    .join('')
    .slice(0, 8)
}

interface CreateBody {
  referrerType?: 'client' | 'agent'
  referrerName?: string
  referrerEmail?: string
  rewardType?: 'cash' | 'discount' | 'commission'
  rewardAmount?: number
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateBody>(event)
  if (!body?.referrerName?.trim()) throw createError({ statusCode: 422, statusMessage: 'El nombre del referidor es obligatorio' })

  const db = useDb(event)
  const [row] = await db
    .insert(schema.referralLinks)
    .values({
      organizationId: orgId,
      code: generateCode(),
      referrerType: body.referrerType === 'agent' ? 'agent' : 'client',
      referrerName: body.referrerName.trim().slice(0, 200),
      referrerEmail: body.referrerEmail || null,
      rewardType: body.rewardType || 'cash',
      rewardAmount: body.rewardAmount ?? null,
      createdAt: now(),
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'referral-link', resourceId: row.id })
  return row
})

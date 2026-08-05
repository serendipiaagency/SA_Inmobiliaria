import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { dispatchWebhook } from '../../../utils/webhooks'

interface CreateDealBody {
  leadId?: number
  clientName?: string
  propertyId?: number
  propertyName?: string
  agentId?: number
  agentName?: string
  dealType?: 'sale' | 'rental'
  dealValue?: number
  commissionRate?: number
  closedAt?: string
}

/** Records a real closed deal — the only source of truth for revenue and commissions, so validated strictly rather than accepting a loose shape. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateDealBody>(event)

  if (!body?.clientName?.trim()) throw createError({ statusCode: 422, statusMessage: 'El nombre del cliente es obligatorio' })
  const dealValue = Number(body.dealValue)
  if (!Number.isFinite(dealValue) || dealValue <= 0) throw createError({ statusCode: 422, statusMessage: 'El valor de la operación debe ser un número positivo' })
  const commissionRate = body.commissionRate != null ? Number(body.commissionRate) : 0
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) throw createError({ statusCode: 422, statusMessage: 'El % de comisión debe estar entre 0 y 100' })
  const dealType = body.dealType === 'rental' ? 'rental' : 'sale'
  const closedAt = body.closedAt || now().slice(0, 10)

  const db = useDb(event)
  const nowTs = now()
  const [row] = await db
    .insert(schema.deals)
    .values({
      organizationId: orgId,
      leadId: body.leadId || null,
      clientName: body.clientName.trim().slice(0, 200),
      propertyId: body.propertyId || null,
      propertyName: body.propertyName?.slice(0, 200) || null,
      agentId: body.agentId || null,
      agentName: body.agentName?.slice(0, 200) || null,
      dealType,
      dealValue,
      commissionRate,
      commissionAmount: Math.round(dealValue * (commissionRate / 100) * 100) / 100,
      closedAt,
      createdBy: user.id,
      createdAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'deal', resourceId: row.id })
  await dispatchWebhook(event, orgId, 'deal.closed', { id: row.id, clientName: row.clientName, dealType: row.dealType, dealValue: row.dealValue, commissionAmount: row.commissionAmount, closedAt: row.closedAt })
  return row
})

import { requireOrgScope } from '../../../utils/auth'
import { listBuyerRequirements, summarizeRequirement } from '../../../utils/buyerRequirements/service'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const query = getQuery(event)
  const contactId = query.contactId ? Number(query.contactId) : undefined
  if (query.contactId && !Number.isFinite(contactId)) throw createError({ statusCode: 400, statusMessage: 'contactId inválido' })

  const rows = await listBuyerRequirements(event, orgId, { contactId })
  return rows.map((r) => ({ ...r, summary: summarizeRequirement(r) }))
})

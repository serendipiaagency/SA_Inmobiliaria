import { requireOrgScope } from '../../../../utils/auth'
import { unassignedLeads } from '../../../../utils/leads/routingService'

/** La cola de leads vivos sin dueño. No debería tener nada, y por eso se puede mirar. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  return unassignedLeads(event, orgId)
})

import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listBuyerRequirements, summarizeRequirement } from '../../../utils/buyerRequirements/service'
import { listZoneSuggestions } from '../../../utils/buyerRequirements/zoneSuggestions'
import { organizationCurrency } from '../../../utils/currency'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const query = getQuery(event)
  // `?zoneSuggestions=1`: las zonas reales de las fichas de la agencia, para
  // el editor de la necesidad (sin ruta nueva: el presupuesto de rutas está agotado).
  if (query.zoneSuggestions === '1') return listZoneSuggestions(useDb(event), orgId)
  const contactId = query.contactId ? Number(query.contactId) : undefined
  if (query.contactId && !Number.isFinite(contactId)) throw createError({ statusCode: 400, statusMessage: 'contactId inválido' })

  const rows = await listBuyerRequirements(event, orgId, { contactId })
  const currency = await organizationCurrency(useDb(event), orgId)
  return rows.map((r) => ({ ...r, summary: summarizeRequirement(r, currency) }))
})

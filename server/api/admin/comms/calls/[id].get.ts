import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { crmNamesFor, loadCallForOrg, loadContactForOrg, serializeCall, serializeContact } from '../../../../utils/comms/admin'

/** GET /api/admin/comms/calls/:id — estado de una llamada, con la sesión SDP mientras esté viva (el navegador lo consulta hasta tener la respuesta). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const call = await loadCallForOrg(db, orgId, Number(getRouterParam(event, 'id')))
  const contact = await loadContactForOrg(db, orgId, call.contactId)
  return { call: serializeCall(call, { includeSession: true }), contact: serializeContact(contact, await crmNamesFor(db, orgId, [contact])) }
})

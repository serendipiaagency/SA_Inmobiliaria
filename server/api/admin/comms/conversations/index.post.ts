import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, useDb } from '../../../../utils/db'
import { openConversation } from '../../../../utils/comms/open'
import { upsertLead } from '../../../../utils/leads'

/**
 * POST /api/admin/comms/conversations — abre (o encuentra) la conversación
 * con un cliente, un lead o un teléfono suelto, desde el botón "WhatsApp"
 * de su ficha. Si la agencia no tiene ningún número conectado responde 409
 * con el enlace oficial wa.me para abrir la app de WhatsApp: no hay
 * bandeja, pero tampoco se finge que la hay. La lógica vive en
 * server/utils/comms/open.ts (compartida con la Domain Tool send_property).
 *
 * Body: { clientId?: number; leadId?: number; phone?: string; channelId?: number }
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'write')
  const body = (await readBody(event)) || {}
  return openConversation(useDb(event), cfEnv(event) as Record<string, any>, orgId, {
    clientId: body.clientId ? Number(body.clientId) : null,
    leadId: body.leadId ? Number(body.leadId) : null,
    phone: body.phone ? String(body.phone) : null,
    channelId: body.channelId ? Number(body.channelId) : null,
    createLead: (lead) => upsertLead(event, lead),
  })
})

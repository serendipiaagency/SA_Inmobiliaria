import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { getCommsSettings } from '../../../utils/comms/inbox'

/** GET /api/admin/comms/settings — ajustes del Centro de Comunicaciones de la organización (Configuración → Comunicaciones). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'system', 'read')
  return getCommsSettings(useDb(event), orgId)
})

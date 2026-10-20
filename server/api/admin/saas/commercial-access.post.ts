import { requireOrgScope } from '../../../utils/auth'
import { manageCommercialAccess, type CommercialAccessAction } from '../../../utils/team/invite'

/**
 * POST /api/admin/saas/commercial-access — «Invitar a la plataforma» un
 * comercial, reenviar su invitación o revocar su acceso.
 *
 * Exige escritura en Sistema (`system:write`): lo hace el administrador de la
 * agencia o un gerente, nunca un comercial (que no tiene esa área). El preset
 * de permisos «comercial» se aplica en el servidor con un valor fijo, así que
 * invitar no permite editar permisos arbitrarios.
 */
const ACTIONS: CommercialAccessAction[] = ['invite', 'resend', 'revoke']

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const body = (await readBody(event).catch(() => null)) as { teamMemberId?: unknown; action?: unknown } | null
  const teamMemberId = Number(body?.teamMemberId)
  const action = String(body?.action || '') as CommercialAccessAction
  if (!Number.isInteger(teamMemberId) || teamMemberId <= 0) throw createError({ statusCode: 422, statusMessage: 'Falta el comercial' })
  if (!ACTIONS.includes(action)) throw createError({ statusCode: 422, statusMessage: 'Acción no válida' })
  return manageCommercialAccess(event, user, orgId, teamMemberId, action)
})

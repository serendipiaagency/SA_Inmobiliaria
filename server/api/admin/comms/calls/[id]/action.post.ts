import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, useDb } from '../../../../../utils/db'
import { loadCallForOrg, serializeCall } from '../../../../../utils/comms/admin'
import { callAction } from '../../../../../utils/comms/calls'
import { loadChannel } from '../../../../../utils/comms/credentials'

/**
 * POST /api/admin/comms/calls/:id/action — pre_accept / accept (con la
 * respuesta SDP del navegador) para una llamada entrante, reject, o
 * terminate para cualquiera. Meta corta sola una entrante no aceptada en
 * 30–60 s, así que aceptar tarde devuelve el error del proveedor tal cual.
 *
 * Body: { action: 'pre_accept'|'accept'|'reject'|'terminate'; sdpAnswer?: string }
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const call = await loadCallForOrg(db, orgId, Number(getRouterParam(event, 'id')))
  if (call.provider !== 'meta_cloud' || !call.channelId) throw createError({ statusCode: 409, statusMessage: 'Esta llamada no se controla desde aquí.' })
  const body = (await readBody(event)) || {}
  const action = String(body.action || '')
  if (!['pre_accept', 'accept', 'reject', 'terminate'].includes(action)) throw createError({ statusCode: 422, statusMessage: 'Acción no válida' })
  const channel = await loadChannel(db, env, { id: call.channelId, orgId })
  if (!channel) throw createError({ statusCode: 503, statusMessage: 'No se pueden leer las credenciales del canal.' })
  const r = await callAction(db, env, { channel, call, action: action as 'pre_accept' | 'accept' | 'reject' | 'terminate', sdpAnswer: body.sdpAnswer ? String(body.sdpAnswer) : null })
  if (!r.ok) throw createError({ statusCode: 502, statusMessage: r.error || 'El proveedor rechazó la acción' })
  return { ok: true, call: serializeCall(r.call!, { includeSession: true }) }
})

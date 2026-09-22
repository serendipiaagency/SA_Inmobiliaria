import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, now, useDb } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { loadChannel, touchChannel } from '../../../../../utils/comms/credentials'
import { metaGetCallingSettings, metaSetCallingStatus } from '../../../../../utils/comms/providers/metaCloud'

/**
 * POST /api/admin/comms/channels/:id/calling — { action: 'check' | 'enable' | 'disable' }
 * Consulta o cambia el estado de las llamadas en el número (GET/POST
 * /<PHONE_NUMBER_ID>/settings de Meta). Lo que Meta responda es lo que se
 * guarda en `callingStatus`; si rechaza activar (límite de mensajería,
 * número no apto…), el motivo queda en `callingNote`.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const channel = await loadChannel(db, env, { id: Number(getRouterParam(event, 'id')), orgId })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  const body = (await readBody(event)) || {}
  const action = String(body.action || 'check')
  if (!['check', 'enable', 'disable'].includes(action)) throw createError({ statusCode: 422, statusMessage: 'Acción no válida' })

  if (channel.provider !== 'meta_cloud') {
    await touchChannel(db, channel.id, { callingStatus: 'unavailable', callingCheckedAt: now(), callingNote: 'Este proveedor no ofrece llamadas de voz por WhatsApp para este número.' })
    return { ok: true, callingStatus: 'unavailable', note: 'Este proveedor no ofrece llamadas de voz por WhatsApp para este número.' }
  }

  if (action !== 'check') {
    const set = await metaSetCallingStatus(channel, env, action === 'enable')
    if (!set.ok) {
      await touchChannel(db, channel.id, { callingCheckedAt: now(), callingNote: set.error })
      throw createError({ statusCode: 502, statusMessage: set.error || 'Meta rechazó el cambio' })
    }
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-channel', resourceId: channel.id, detail: `calling:${action}` })
  }
  const r = await metaGetCallingSettings(channel, env)
  if (!r.ok || !r.settings) {
    await touchChannel(db, channel.id, { callingCheckedAt: now(), callingNote: r.error })
    throw createError({ statusCode: 502, statusMessage: r.error || 'Meta no devolvió los ajustes' })
  }
  const status = r.settings.status === 'ENABLED' ? 'enabled' : r.settings.status === 'DISABLED' ? 'disabled' : 'unknown'
  const note = status === 'enabled' ? `Llamadas activas (icono: ${r.settings.callIconVisibility || 'por defecto'}; permiso al devolver llamada: ${r.settings.callbackPermissionStatus || 'sin dato'}).` : status === 'disabled' ? 'Meta tiene las llamadas desactivadas en este número.' : 'Meta no informa del estado de llamadas de este número (¿la función no está disponible para él?).'
  await touchChannel(db, channel.id, { callingStatus: status, callingCheckedAt: now(), callingNote: note })
  return { ok: true, callingStatus: status, note, settings: r.settings }
})

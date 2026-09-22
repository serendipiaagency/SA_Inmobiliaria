import { requireOrgScope } from '../../../../../utils/auth'
import { cfEnv, useDb } from '../../../../../utils/db'
import { loadChannel, touchChannel } from '../../../../../utils/comms/credentials'
import { metaVerifyNumber } from '../../../../../utils/comms/providers/metaCloud'
import { twilioVerifyAccount } from '../../../../../utils/comms/providers/twilio'

/** POST /api/admin/comms/channels/:id/test — una llamada real y de sólo lectura al proveedor para comprobar que las credenciales sirven. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'system', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const channel = await loadChannel(db, env, { id: Number(getRouterParam(event, 'id')), orgId })
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  if (channel.provider === 'meta_cloud') {
    const r = await metaVerifyNumber(channel, env)
    await touchChannel(db, channel.id, { lastError: r.ok ? null : r.error })
    return { ok: r.ok, error: r.error, details: r.ok ? { displayPhoneNumber: r.displayPhoneNumber, verifiedName: r.verifiedName, qualityRating: r.qualityRating } : null }
  }
  const r = await twilioVerifyAccount(channel)
  await touchChannel(db, channel.id, { lastError: r.ok ? null : r.error })
  return { ok: r.ok, error: r.error, details: r.ok ? { friendlyName: r.friendlyName } : null }
})

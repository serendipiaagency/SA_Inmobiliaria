import { useDb, cfEnv } from '../../../utils/db'
import { requireUser } from '../../../utils/auth'
import { rateLimit } from '../../../utils/rateLimit'
import { confirmTwoFactorSetup, TwoFactorUnavailableError } from '../../../utils/twoFactor'
import { logAdminAction } from '../../../utils/audit'

/** Confirma el alta con el primer código de la app. Devuelve los códigos de recuperación, una sola vez. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'totp-enable', { limit: 15, windowSeconds: 600 })
  const user = await requireUser(event)
  const body = await readBody<{ code?: string }>(event)
  if (!body?.code) throw createError({ statusCode: 422, statusMessage: 'code is required' })

  try {
    const result = await confirmTwoFactorSetup(useDb(event), cfEnv(event), user.id, body.code)
    if (!result.ok) throw createError({ statusCode: 401, statusMessage: 'El código no es correcto. Comprueba la hora del teléfono y vuelve a intentarlo.' })
    await logAdminAction(event, { user, orgId: user.organizationId, action: 'update', resource: 'users', resourceId: user.id, detail: 'segundo factor (2FA) activado' })
    return { ok: true, recoveryCodes: result.recoveryCodes }
  } catch (err: any) {
    if (err instanceof TwoFactorUnavailableError) throw createError({ statusCode: 503, statusMessage: err.message })
    throw err
  }
})

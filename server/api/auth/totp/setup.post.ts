import { useDb, cfEnv } from '../../../utils/db'
import { requireUser } from '../../../utils/auth'
import { beginTwoFactorSetup, TwoFactorUnavailableError } from '../../../utils/twoFactor'
import { renderQrSvg } from '../../../utils/qr'

/**
 * Empieza el alta del segundo factor de la propia cuenta: secreto nuevo
 * (guardado cifrado, todavía inactivo), la URL otpauth y el QR listo para
 * escanear. No queda activo hasta que /enable recibe un código correcto.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  try {
    const { secret, otpauthUrl } = await beginTwoFactorSetup(useDb(event), cfEnv(event), user.id)
    return { secret, otpauthUrl, qrSvg: renderQrSvg(otpauthUrl, { errorCorrectionLevel: 'M' }) }
  } catch (err: any) {
    if (err instanceof TwoFactorUnavailableError) throw createError({ statusCode: 503, statusMessage: err.message })
    throw createError({ statusCode: 409, statusMessage: err?.message || 'No se pudo iniciar el alta' })
  }
})

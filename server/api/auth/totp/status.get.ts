import { useDb, cfEnv } from '../../../utils/db'
import { requireUser } from '../../../utils/auth'
import { getTwoFactorStatus } from '../../../utils/twoFactor'

/** Estado del segundo factor de la PROPIA cuenta (nunca de otra). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return getTwoFactorStatus(useDb(event), cfEnv(event), user.id)
})

import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireUser, verifyPassword } from '../../../utils/auth'
import { rateLimit } from '../../../utils/rateLimit'
import { checkSecondFactor, disableTwoFactor } from '../../../utils/twoFactor'
import { logAdminAction } from '../../../utils/audit'

/**
 * Quita el segundo factor de la propia cuenta. Exige la contraseña actual Y
 * un código válido (TOTP o de recuperación): una sesión abierta en un
 * ordenador ajeno no basta para desproteger la cuenta.
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'totp-disable', { limit: 10, windowSeconds: 600 })
  const user = await requireUser(event)
  const body = await readBody<{ password?: string; code?: string }>(event)
  if (!body?.password || !body?.code) throw createError({ statusCode: 422, statusMessage: 'password and code are required' })

  const db = useDb(event)
  const [row] = await db.select({ password: schema.users.password, totpEnabledAt: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (!row?.totpEnabledAt) throw createError({ statusCode: 409, statusMessage: 'El segundo factor no está activo' })
  if (!(await verifyPassword(body.password, row.password))) throw createError({ statusCode: 401, statusMessage: 'Contraseña incorrecta' })
  const check = await checkSecondFactor(db, cfEnv(event), user.id, body.code)
  if (!check.ok) throw createError({ statusCode: 401, statusMessage: 'El código no es correcto' })

  await disableTwoFactor(db, user.id)
  await logAdminAction(event, { user, orgId: user.organizationId, action: 'update', resource: 'users', resourceId: user.id, detail: 'segundo factor (2FA) desactivado' })
  return { ok: true }
})

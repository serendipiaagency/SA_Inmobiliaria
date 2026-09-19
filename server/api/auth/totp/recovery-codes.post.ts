import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireUser, verifyPassword } from '../../../utils/auth'
import { rateLimit } from '../../../utils/rateLimit'
import { regenerateRecoveryCodes } from '../../../utils/twoFactor'
import { logAdminAction } from '../../../utils/audit'

/** Códigos de recuperación nuevos (los anteriores dejan de valer). Exige la contraseña actual. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'totp-recovery-codes', { limit: 10, windowSeconds: 600 })
  const user = await requireUser(event)
  const body = await readBody<{ password?: string }>(event)
  if (!body?.password) throw createError({ statusCode: 422, statusMessage: 'password is required' })

  const db = useDb(event)
  const [row] = await db.select({ password: schema.users.password, totpEnabledAt: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (!row?.totpEnabledAt) throw createError({ statusCode: 409, statusMessage: 'El segundo factor no está activo' })
  if (!(await verifyPassword(body.password, row.password))) throw createError({ statusCode: 401, statusMessage: 'Contraseña incorrecta' })

  const recoveryCodes = await regenerateRecoveryCodes(db, user.id)
  await logAdminAction(event, { user, orgId: user.organizationId, action: 'update', resource: 'users', resourceId: user.id, detail: 'códigos de recuperación del 2FA regenerados' })
  return { ok: true, recoveryCodes }
})

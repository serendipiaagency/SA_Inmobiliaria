import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { createSession } from '../../../utils/auth'
import { rateLimit } from '../../../utils/rateLimit'
import { resolveLoginChallenge } from '../../../utils/twoFactor'
import { logAdminAction } from '../../../utils/audit'

/**
 * Segundo paso del login con 2FA: desafío + código → sesión.
 *
 * Los motivos de fallo se devuelven tal cual (`expired`, `too_many_attempts`,
 * `wrong_code`) porque quien llega aquí ya ha demostrado la contraseña —
 * decirle que el desafío caducó no filtra nada y le ahorra reintentar contra
 * un código que nunca va a entrar.
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'totp-verify', { limit: 15, windowSeconds: 600 })

  const body = await readBody<{ challenge?: string; code?: string }>(event)
  if (!body?.challenge || !body?.code) throw createError({ statusCode: 422, statusMessage: 'challenge and code are required' })

  const db = useDb(event)
  const result = await resolveLoginChallenge(db, cfEnv(event), body.challenge, body.code)
  if (!result.ok) {
    throw createError({ statusCode: result.reason === 'wrong_code' ? 401 : 400, statusMessage: result.reason, data: { reason: result.reason } })
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, result.userId)).limit(1)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })

  // Entrar con un código de recuperación es un hecho que merece constar:
  // significa que la app de autenticación no estaba a mano, y que quedan
  // menos códigos.
  if (result.method === 'recovery') {
    await logAdminAction(event, {
      user: { id: user.id, email: user.email },
      orgId: user.organizationId,
      action: 'update',
      resource: 'users',
      resourceId: user.id,
      detail: `inicio de sesión con código de recuperación (quedan ${result.recoveryCodesLeft ?? 0})`,
    })
  }

  await createSession(event, user.id)
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, method: result.method, recoveryCodesLeft: result.recoveryCodesLeft }
})

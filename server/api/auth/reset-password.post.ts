import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'
import { consumePasswordResetToken, hashPassword, revokeAllSessions } from '../../utils/auth'
import { rateLimit } from '../../utils/rateLimit'
import { logAdminAction } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'reset-password', { limit: 10, windowSeconds: 600 })

  const body = await readBody<{ token?: string; password?: string }>(event)
  if (!body?.token || !body?.password) throw createError({ statusCode: 422, statusMessage: 'token and password are required' })
  if (body.password.length < 8) throw createError({ statusCode: 422, statusMessage: 'password must be at least 8 characters' })

  const db = useDb(event)
  const userId = await consumePasswordResetToken(db, body.token)
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token' })

  await db.update(schema.users).set({ password: await hashPassword(body.password), updatedAt: now() }).where(eq(schema.users.id, userId))

  // Cerrar TODAS las sesiones abiertas de esa cuenta.
  //
  // Sin esto, cambiar la contraseña no echa a nadie: la sesión vive en su
  // propia fila con su cookie, y `SESSION_TTL_DAYS` son 7 días. Quien tuviera
  // una sesión abierta —el caso que importa: alguien que ya no debería
  // entrar— seguiría dentro hasta una semana después de haberle cambiado la
  // contraseña, y el panel diría que la contraseña está cambiada.
  //
  // Se borran todas y no «todas menos la actual» a propósito: aquí no hay
  // sesión actual (la credencial es el token del enlace), y quien acaba de
  // elegir contraseña puede entrar con ella.
  const closed = await revokeAllSessions(db, userId)

  // Consta en la auditoría como acción de la propia cuenta: no hay sesión
  // (el token es la credencial), pero un cambio de contraseña es de lo
  // primero que se mira si una cuenta se comporta raro, y hasta ahora este
  // camino no dejaba rastro. Sólo el hecho y la IP; nunca la contraseña.
  const [target] = await db
    .select({ id: schema.users.id, email: schema.users.email, organizationId: schema.users.organizationId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (target) {
    await logAdminAction(event, {
      user: { id: target.id, email: target.email },
      orgId: target.organizationId,
      action: 'update',
      resource: 'users',
      resourceId: target.id,
      detail: `contraseña cambiada mediante enlace de recuperación; ${closed} sesión(es) abierta(s) cerrada(s)`,
    })
  }

  return { ok: true }
})

import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'
import { consumePasswordResetToken, hashPassword } from '../../utils/auth'
import { rateLimit } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'reset-password', { limit: 10, windowSeconds: 600 })

  const body = await readBody<{ token?: string; password?: string }>(event)
  if (!body?.token || !body?.password) throw createError({ statusCode: 422, statusMessage: 'token and password are required' })
  if (body.password.length < 8) throw createError({ statusCode: 422, statusMessage: 'password must be at least 8 characters' })

  const db = useDb(event)
  const userId = await consumePasswordResetToken(db, body.token)
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token' })

  await db.update(schema.users).set({ password: await hashPassword(body.password), updatedAt: now() }).where(eq(schema.users.id, userId))

  return { ok: true }
})

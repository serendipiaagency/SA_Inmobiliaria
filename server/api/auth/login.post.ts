import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { verifyPassword, dummyVerify, createSession } from '../../utils/auth'
import { rateLimit } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  // Brute-force guard: 10 attempts / 10 min per IP. Keyed on IP only (not email) so an
  // attacker can't dodge the limit by rotating target accounts against a fixed IP either.
  await rateLimit(event, 'login', { limit: 10, windowSeconds: 600 })

  const body = await readBody<{ email?: string; password?: string }>(event)
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 422, statusMessage: 'Email and password are required' })
  }
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase().trim()))
    .limit(1)
  const user = rows[0]
  if (!user) {
    await dummyVerify(body.password) // keep timing identical to the "wrong password" branch
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  if (!(await verifyPassword(body.password, user.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  await createSession(event, user.id)
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
})

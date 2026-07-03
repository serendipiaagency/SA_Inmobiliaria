import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { verifyPassword, createSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
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
  if (!user || !(await verifyPassword(body.password, user.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  await createSession(event, user.id)
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
})

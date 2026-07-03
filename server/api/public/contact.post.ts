import { useDb, schema, now } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const { name, email, message } = body || {}
  if (!name || !email || !message) {
    throw createError({ statusCode: 422, statusMessage: 'name, email and message are required' })
  }
  const type = body.type === 'complaint' ? 'complaint' : 'contact'
  const db = useDb(event)
  await db.insert(schema.contactMessages).values({
    type,
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: body.phone ? String(body.phone).slice(0, 50) : null,
    subject: body.subject ? String(body.subject).slice(0, 300) : null,
    message: String(message).slice(0, 5000),
    createdAt: now(),
  })
  return { ok: true }
})

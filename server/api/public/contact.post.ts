import { useDb, schema, now } from '../../utils/db'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'
import { requireValidEmail } from '../../utils/validate'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'contact', { limit: 5, windowSeconds: 600 })

  const body = await readBody<Record<string, any>>(event)
  const { name, message } = body || {}
  if (!name || !body?.email || !message) {
    throw createError({ statusCode: 422, statusMessage: 'name, email and message are required' })
  }
  const email = requireValidEmail(body.email)
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

  // Sales enquiries become CRM leads; complaints are support issues, not prospects.
  if (type === 'contact') {
    try {
      await upsertLead(event, {
        name: String(name).slice(0, 200),
        email: String(email).slice(0, 200),
        phone: body.phone ? String(body.phone).slice(0, 50) : null,
        source: 'web',
        notes: body.subject ? String(body.subject).slice(0, 300) : null,
      })
    } catch {
      // Lead pipeline must never block the visitor's message from being saved.
    }
  }

  return { ok: true }
})

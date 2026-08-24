import { useDb, schema, now, resolvePublicOrgId, cfEnv } from '../../utils/db'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'
import { requireValidEmail } from '../../utils/validate'
import { sendInternalNotification } from '../../utils/email/send'

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'contact', { limit: 5, windowSeconds: 600 })

  const body = await readBody<Record<string, any>>(event)
  const { name, message } = body || {}
  if (!name || !body?.email || !message) {
    throw createError({ statusCode: 422, statusMessage: 'name, email and message are required' })
  }
  const email = requireValidEmail(body.email)
  const type = body.type === 'complaint' ? 'complaint' : 'contact'
  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  await db.insert(schema.contactMessages).values({
    organizationId: orgId,
    type,
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: body.phone ? String(body.phone).slice(0, 50) : null,
    subject: body.subject ? String(body.subject).slice(0, 300) : null,
    message: String(message).slice(0, 5000),
    createdAt: now(),
  })

  // Sales enquiries become CRM leads (which sends its own internal
  // notification, see server/utils/leads.ts); complaints are support issues,
  // not prospects, so they get their own internal notification here instead.
  if (type === 'contact') {
    try {
      await upsertLead(event, {
        organizationId: orgId,
        name: String(name).slice(0, 200),
        email: String(email).slice(0, 200),
        phone: body.phone ? String(body.phone).slice(0, 50) : null,
        source: 'web',
        notes: body.subject ? String(body.subject).slice(0, 300) : null,
      })
    } catch {
      // Lead pipeline must never block the visitor's message from being saved.
    }
    try {
      await sendInternalNotification(db, cfEnv(event), orgId, 'contact_message', { name, email, phone: body.phone, subject: body.subject, message })
    } catch {
      // The message is already saved — a notification failure must never undo that.
    }
  } else {
    try {
      await sendInternalNotification(db, cfEnv(event), orgId, 'complaint', { name, email, phone: body.phone, message })
    } catch {
      // The complaint is already saved — a notification failure must never undo that.
    }
  }

  return { ok: true }
})

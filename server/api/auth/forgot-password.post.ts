import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv, DEFAULT_PUBLIC_ORG_ID } from '../../utils/db'
import { createPasswordResetToken } from '../../utils/auth'
import { rateLimit } from '../../utils/rateLimit'
import { requireValidEmail } from '../../utils/validate'
import { sendTransactionalEmail } from '../../utils/email/send'

/**
 * Always responds {ok:true} regardless of whether the email matches a real
 * account — the alternative (a distinct "no account with that email"
 * response) lets an attacker enumerate registered emails one guess at a
 * time. The real signal (whether an email actually went out) only ever
 * exists server-side, in email_log.
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'forgot-password', { limit: 5, windowSeconds: 600 })

  const body = await readBody<{ email?: string }>(event)
  if (!body?.email) throw createError({ statusCode: 422, statusMessage: 'email is required' })
  const email = requireValidEmail(body.email)

  const db = useDb(event)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (user) {
    try {
      const token = await createPasswordResetToken(db, user.id)
      const resetUrl = `${getRequestURL(event).origin}/reset-password/${token}`
      await sendTransactionalEmail(db, cfEnv(event), {
        organizationId: user.organizationId ?? DEFAULT_PUBLIC_ORG_ID,
        template: 'password_reset',
        to: user.email,
        data: { resetUrl },
      })
    } catch {
      // Never let an email-sending failure leak whether the account exists via a different response shape/timing.
    }
  }

  return { ok: true }
})

import * as schema from '../../db/schema'
import { now } from '../db'
import { sendEmail } from '../email'

export type NotificationType = 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'cancelled' | 'rescheduled'

interface NotifyAppointmentInput {
  organizationId: number
  visitId: number
  type: NotificationType
  recipientEmail?: string | null
  recipientPhone?: string | null
  subject: string
  message: string
  html?: string
}

/**
 * Records one notification row per applicable channel and actually attempts
 * delivery for the ones that have a real connected provider. `internal`
 * always lands (it's just an in-app record, always "delivered"); `email`
 * really sends through Resend once configured; `whatsapp` has no
 * credential-free provider so it's recorded but honestly marked
 * undelivered with the reason, ready to light up the moment a provider
 * (WhatsApp Business API / Twilio) is wired in.
 */
export async function notifyAppointment(db: any, env: Record<string, any>, input: NotifyAppointmentInput): Promise<void> {
  const nowTs = now()

  await db.insert(schema.appointmentNotifications).values({
    organizationId: input.organizationId,
    visitId: input.visitId,
    type: input.type,
    channel: 'internal',
    recipient: null,
    message: input.message,
    delivered: 1,
    createdAt: nowTs,
  })

  if (input.recipientEmail) {
    const result = await sendEmail(env, { to: input.recipientEmail, subject: input.subject, html: input.html || `<p>${input.message}</p>` })
    await db.insert(schema.appointmentNotifications).values({
      organizationId: input.organizationId,
      visitId: input.visitId,
      type: input.type,
      channel: 'email',
      recipient: input.recipientEmail,
      message: input.message,
      delivered: result.ok ? 1 : 0,
      errorMessage: result.ok ? null : result.message,
      createdAt: nowTs,
    })
  }

  if (input.recipientPhone) {
    await db.insert(schema.appointmentNotifications).values({
      organizationId: input.organizationId,
      visitId: input.visitId,
      type: input.type,
      channel: 'whatsapp',
      recipient: input.recipientPhone,
      message: input.message,
      delivered: 0,
      errorMessage: 'WhatsApp no conectado: requiere configurar WhatsApp Business API o Twilio en el Worker.',
      createdAt: nowTs,
    })
  }
}

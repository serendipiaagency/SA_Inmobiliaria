import * as schema from '../../db/schema'
import { now } from '../db'
import { sendTransactionalEmail } from '../email/send'
import type { TemplateKey } from '../email/templates'
import { sendWhatsAppMessage } from '../whatsapp'

export type NotificationType = 'confirmation' | 'reminder_24h' | 'reminder_1h' | 'cancelled' | 'rescheduled'

const TEMPLATE_BY_TYPE: Record<NotificationType, TemplateKey> = {
  confirmation: 'appointment_created',
  reminder_24h: 'appointment_reminder_24h',
  reminder_1h: 'appointment_reminder_1h',
  cancelled: 'appointment_cancelled',
  rescheduled: 'appointment_modified',
}

interface NotifyAppointmentInput {
  organizationId: number
  visitId: number
  type: NotificationType
  recipientEmail?: string | null
  recipientPhone?: string | null
  /** Internal-channel record text — kept separate from the email template's own copy, which is generated from scheduledAt/agentName below. */
  message: string
  scheduledAt: string
  agentName?: string | null
  propertyName?: string | null
  manageUrl?: string | null
  videoLink?: string | null
  /** Correlation id (server/utils/requestId.ts) of the request that triggered this notification, when there is one — see email_log.requestId. */
  requestId?: string | null
  /** Origen público del Worker (https://…) para que Twilio devuelva el estado del WhatsApp al webhook; sin él se envía igual, sin confirmación de entrega. */
  publicOrigin?: string | null
}

/**
 * Records one notification row per applicable channel and actually attempts
 * delivery for the ones that have a real connected provider. `internal`
 * always lands (it's just an in-app record, always "delivered"); `email`
 * really sends through Resend once configured — via the tracked, retried,
 * webhook-confirmed system in server/utils/email/send.ts, not a fire-and-
 * forget call — and this row's `delivered` reflects whether the SEND
 * attempt was accepted, same meaning it always had (real delivery
 * confirmation lives on email_log/the Resend webhook, not here); `whatsapp`
 * goes out through Twilio once TWILIO_* is configured (server/utils/whatsapp.ts)
 * — `delivered` means Twilio ACCEPTED it, and the status webhook
 * (server/api/twilio/status.post.ts) later flips it to the real outcome by
 * `externalId`; without credentials it's recorded and honestly marked
 * undelivered with the reason, exactly as before.
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
    const [result] = await sendTransactionalEmail(db, env, {
      organizationId: input.organizationId,
      template: TEMPLATE_BY_TYPE[input.type],
      to: input.recipientEmail,
      data: { scheduledAt: input.scheduledAt, agentName: input.agentName, propertyName: input.propertyName, manageUrl: input.manageUrl, videoLink: input.videoLink },
      requestId: input.requestId,
    })
    await db.insert(schema.appointmentNotifications).values({
      organizationId: input.organizationId,
      visitId: input.visitId,
      type: input.type,
      channel: 'email',
      recipient: input.recipientEmail,
      message: input.message,
      delivered: result?.ok ? 1 : 0,
      errorMessage: result?.ok ? null : result?.message || null,
      createdAt: nowTs,
    })
  }

  if (input.recipientPhone) {
    const result = await sendWhatsAppMessage(env, {
      to: input.recipientPhone,
      body: input.message,
      statusCallbackUrl: input.publicOrigin ? `${input.publicOrigin.replace(/\/$/, '')}/api/twilio/status` : null,
    })
    await db.insert(schema.appointmentNotifications).values({
      organizationId: input.organizationId,
      visitId: input.visitId,
      type: input.type,
      channel: 'whatsapp',
      recipient: input.recipientPhone,
      message: input.message,
      delivered: result.ok ? 1 : 0,
      errorMessage: result.ok ? null : result.message,
      externalId: result.sid,
      createdAt: nowTs,
    })
  }
}

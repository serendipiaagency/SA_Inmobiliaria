import * as schema from '../../db/schema'
import { now } from '../db'
import { sendTransactionalEmail } from '../email/send'
import type { TemplateKey } from '../email/templates'

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
 * has no credential-free provider so it's recorded but honestly marked
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

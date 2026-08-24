import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'

export interface ResendApplyResult {
  status: 'processed' | 'ignored'
  emailLogId?: number
  organizationId?: number
  note: string
}

/**
 * Applies one already-signature-verified, already-deduplicated Resend
 * webhook event to email_log. Matches by `externalId` (Resend's own email
 * id, captured when we called their API — server/utils/email/send.ts).
 * `email.delivered`/`email.bounced`/`email.complained` are the ONLY code
 * paths anywhere that ever set those statuses — see email_log's schema
 * comment.
 */
export async function applyResendEvent(db: any, type: string, data: any): Promise<ResendApplyResult> {
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const emailId: string | undefined = data?.email_id
  if (!emailId) return { status: 'ignored', note: 'El evento no incluye email_id' }

  const [row] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.externalId, emailId)).limit(1)
  if (!row) return { status: 'ignored', note: 'No hay email_log con ese external_id' }

  switch (type) {
    case 'email.sent':
      // We already set 'sent' synchronously when the API call was accepted — this just confirms it, nothing to change.
      return { status: 'processed', emailLogId: row.id, organizationId: row.organizationId, note: 'Confirmado como enviado' }

    case 'email.delivered':
      await db.update(schema.emailLog).set({ status: 'delivered', deliveredAt: nowIso }).where(eq(schema.emailLog.id, row.id))
      return { status: 'processed', emailLogId: row.id, organizationId: row.organizationId, note: 'Entregado' }

    case 'email.bounced': {
      const reason = data?.bounce?.message || data?.reason || 'El destinatario rebotó el email'
      await db.update(schema.emailLog).set({ status: 'bounced', bouncedAt: nowIso, errorMessage: reason }).where(eq(schema.emailLog.id, row.id))
      return { status: 'processed', emailLogId: row.id, organizationId: row.organizationId, note: `Rebotado: ${reason}` }
    }

    case 'email.complained': {
      await db.update(schema.emailLog).set({ status: 'complained', complainedAt: nowIso }).where(eq(schema.emailLog.id, row.id))
      // A spam complaint on a commercial email is a hard opt-out signal —
      // honor it immediately rather than waiting for the recipient to find
      // an unsubscribe link they clearly didn't want to look for.
      if (row.kind === 'commercial') {
        await db
          .update(schema.savedSearches)
          .set({ active: 0 })
          .where(and(eq(schema.savedSearches.organizationId, row.organizationId), eq(schema.savedSearches.email, row.recipient)))
      }
      return { status: 'processed', emailLogId: row.id, organizationId: row.organizationId, note: 'Marcado como reclamación (spam)' }
    }

    default:
      return { status: 'ignored', note: `Tipo de evento no gestionado: ${type}` }
  }
}

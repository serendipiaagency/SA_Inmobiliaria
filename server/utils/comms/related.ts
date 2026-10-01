import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'

/**
 * Las comunicaciones de una persona por los canales que existen de verdad
 * (FASE 29 §139-142): WhatsApp y llamadas (`comms_*`) y los emails que la
 * plataforma le envió (`email_log`). Lo usan la ficha del contacto (y con
 * ella la de la operación, que ya la pide para el nombre del comprador) y la
 * del cliente — cada una pasa los leads/clientes/direcciones que ya cargó.
 *
 * - WhatsApp/llamadas: por vínculo guardado — `comms_contacts.lead_id` /
 *   `client_id`. Sin vínculo, nada.
 * - Email: **sólo saliente**. Resend no recibe correo en este proyecto (su
 *   webhook sólo trae el estado de entrega de lo que enviamos), así que no hay
 *   bandeja de entrada que mostrar y no se inventa una (§115). Se cruza por la
 *   dirección exacta a la que se envió — `email_log` guarda una fila por
 *   destinatario — y nunca se devuelve el HTML: sólo asunto, plantilla,
 *   estado y fechas.
 */
export interface PersonCommunications {
  conversations: { id: number; status: string; lastMessageAt: string | null; lastMessagePreview: string | null; unreadCount: number }[]
  calls: { id: number; direction: string; status: string; outcome: string | null; notes: string | null; durationSeconds: number | null; startedAt: string | null; createdAt: string }[]
  emails: { id: number; subject: string; template: string; kind: string; status: string; sentAt: string | null; deliveredAt: string | null; createdAt: string }[]
}

export async function listPersonCommunications(
  db: any,
  orgId: number,
  input: { leadIds?: number[]; clientIds?: number[]; emails?: (string | null | undefined)[] },
  limit = 20,
): Promise<PersonCommunications> {
  const leadIds = [...new Set(input.leadIds ?? [])]
  const clientIds = [...new Set(input.clientIds ?? [])]
  const emails = [...new Set((input.emails ?? []).map((e) => e?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))]

  const links = [leadIds.length ? inArray(schema.commsContacts.leadId, leadIds) : null, clientIds.length ? inArray(schema.commsContacts.clientId, clientIds) : null].filter((c) => c !== null)
  const commsContactIds: number[] = links.length
    ? (await db.select({ id: schema.commsContacts.id }).from(schema.commsContacts).where(and(eq(schema.commsContacts.organizationId, orgId), or(...links)))).map((r: { id: number }) => r.id)
    : []

  const [conversations, calls, sentEmails] = await Promise.all([
    commsContactIds.length
      ? db
          .select({ id: schema.commsConversations.id, status: schema.commsConversations.status, lastMessageAt: schema.commsConversations.lastMessageAt, lastMessagePreview: schema.commsConversations.lastMessagePreview, unreadCount: schema.commsConversations.unreadCount })
          .from(schema.commsConversations)
          .where(and(eq(schema.commsConversations.organizationId, orgId), inArray(schema.commsConversations.contactId, commsContactIds)))
          .orderBy(desc(schema.commsConversations.lastMessageAt))
          .limit(limit)
      : [],
    commsContactIds.length
      ? db
          .select({ id: schema.commsCalls.id, direction: schema.commsCalls.direction, status: schema.commsCalls.status, outcome: schema.commsCalls.outcome, notes: schema.commsCalls.notes, durationSeconds: schema.commsCalls.durationSeconds, startedAt: schema.commsCalls.startedAt, createdAt: schema.commsCalls.createdAt })
          .from(schema.commsCalls)
          .where(and(eq(schema.commsCalls.organizationId, orgId), inArray(schema.commsCalls.contactId, commsContactIds)))
          .orderBy(desc(schema.commsCalls.id))
          .limit(limit)
      : [],
    emails.length
      ? db
          .select({ id: schema.emailLog.id, subject: schema.emailLog.subject, template: schema.emailLog.template, kind: schema.emailLog.kind, status: schema.emailLog.status, sentAt: schema.emailLog.sentAt, deliveredAt: schema.emailLog.deliveredAt, createdAt: schema.emailLog.createdAt })
          .from(schema.emailLog)
          .where(and(eq(schema.emailLog.organizationId, orgId), inArray(sql`lower(trim(${schema.emailLog.recipient}))`, emails)))
          .orderBy(desc(schema.emailLog.id))
          .limit(limit)
      : [],
  ])

  return { conversations, calls, emails: sentEmails }
}

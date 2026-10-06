import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { WEB_CHANNEL_LABELS, WEB_FORM_TYPE_LABELS, webThreadKey } from './web'

/**
 * Las comunicaciones de una persona por los canales que existen de verdad
 * (FASE 29 §139-142): WhatsApp y llamadas (`comms_*`), los hilos web
 * (formularios y chat, núcleo N8a) y los emails que la plataforma le envió
 * (`email_log`). Lo usan la ficha del contacto (y con ella la de la
 * operación, que ya la pide para el nombre del comprador) y la del cliente —
 * cada una pasa los leads/clientes/direcciones que ya cargó.
 *
 * - WhatsApp/llamadas: por vínculo guardado — `comms_contacts.lead_id` /
 *   `client_id`, y (núcleo N8a) el Contact guardado en el propio hilo
 *   (`comms_conversations.crm_contact_id`). Sin vínculo, nada.
 * - Hilos web: por el Contact o el lead guardados en el hilo
 *   (`comms_web_threads.contact_id` / `lead_id`).
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
  webThreads: { id: string; kind: string; channelLabel: string; formTypeLabel: string | null; status: string; lastMessageAt: string | null; lastMessagePreview: string | null; unreadCount: number }[]
}

export async function listPersonCommunications(
  db: any,
  orgId: number,
  input: { leadIds?: number[]; clientIds?: number[]; contactIds?: number[]; emails?: (string | null | undefined)[] },
  limit = 20,
): Promise<PersonCommunications> {
  const leadIds = [...new Set(input.leadIds ?? [])]
  const clientIds = [...new Set(input.clientIds ?? [])]
  const contactIds = [...new Set(input.contactIds ?? [])]
  const emails = [...new Set((input.emails ?? []).map((e) => e?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))]

  // Listas de tamaño variable: un solo parámetro JSON (D1 admite como máximo 100 por consulta).
  const inIds = (col: any, ids: number[]) => sql`${col} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
  const links = [leadIds.length ? inIds(schema.commsContacts.leadId, leadIds) : null, clientIds.length ? inIds(schema.commsContacts.clientId, clientIds) : null].filter((c) => c !== null)
  const commsContactIds: number[] = links.length
    ? (await db.select({ id: schema.commsContacts.id }).from(schema.commsContacts).where(and(eq(schema.commsContacts.organizationId, orgId), or(...links)))).map((r: { id: number }) => r.id)
    : []
  const conversationLinks = [commsContactIds.length ? inIds(schema.commsConversations.contactId, commsContactIds) : null, contactIds.length ? inIds(schema.commsConversations.crmContactId, contactIds) : null].filter((c) => c !== null)
  const webLinks = [leadIds.length ? inIds(schema.commsWebThreads.leadId, leadIds) : null, contactIds.length ? inIds(schema.commsWebThreads.contactId, contactIds) : null].filter((c) => c !== null)

  const [conversations, calls, sentEmails, webRows] = await Promise.all([
    conversationLinks.length
      ? db
          .select({ id: schema.commsConversations.id, status: schema.commsConversations.status, lastMessageAt: schema.commsConversations.lastMessageAt, lastMessagePreview: schema.commsConversations.lastMessagePreview, unreadCount: schema.commsConversations.unreadCount })
          .from(schema.commsConversations)
          .where(and(eq(schema.commsConversations.organizationId, orgId), or(...conversationLinks)))
          .orderBy(desc(schema.commsConversations.lastMessageAt))
          .limit(limit)
      : [],
    commsContactIds.length
      ? db
          .select({ id: schema.commsCalls.id, direction: schema.commsCalls.direction, status: schema.commsCalls.status, outcome: schema.commsCalls.outcome, notes: schema.commsCalls.notes, durationSeconds: schema.commsCalls.durationSeconds, startedAt: schema.commsCalls.startedAt, createdAt: schema.commsCalls.createdAt })
          .from(schema.commsCalls)
          .where(and(eq(schema.commsCalls.organizationId, orgId), inIds(schema.commsCalls.contactId, commsContactIds)))
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
    webLinks.length
      ? db
          .select({
            id: schema.commsWebThreads.id,
            kind: schema.commsWebThreads.kind,
            formType: schema.commsWebThreads.formType,
            status: schema.commsWebThreads.status,
            lastMessageAt: schema.commsWebThreads.lastMessageAt,
            lastMessagePreview: schema.commsWebThreads.lastMessagePreview,
            unreadCount: schema.commsWebThreads.unreadCount,
          })
          .from(schema.commsWebThreads)
          .where(and(eq(schema.commsWebThreads.organizationId, orgId), or(...webLinks)))
          .orderBy(desc(schema.commsWebThreads.lastMessageAt))
          .limit(limit)
      : [],
  ])

  const webThreads = (webRows as any[]).map((w) => ({
    id: webThreadKey(w.id),
    kind: w.kind,
    channelLabel: (WEB_CHANNEL_LABELS as Record<string, string>)[w.kind] || 'Web',
    formTypeLabel: w.formType ? (WEB_FORM_TYPE_LABELS as Record<string, string>)[w.formType] || w.formType : null,
    status: w.status,
    lastMessageAt: w.lastMessageAt,
    lastMessagePreview: w.lastMessagePreview,
    unreadCount: w.unreadCount,
  }))
  return { conversations, calls, emails: sentEmails, webThreads }
}

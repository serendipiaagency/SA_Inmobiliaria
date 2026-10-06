import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { now, schema } from '../db'
import { defaultChannel, loadChannel } from './credentials'
import { findOrCreateConversation, getCommsSettings, syncConversationCrmContact, upsertContact, type CreateLeadFn } from './inbox'
import { normalizePhone, whatsappClickToChatUrl } from './phone'

/**
 * Abre (o encuentra) la conversación de WhatsApp con un cliente, un lead o
 * un teléfono suelto. Antes vivía dentro de
 * `api/admin/comms/conversations/index.post.ts`; se extrae (FASE 31) para
 * que la Domain Tool `send_property` abra el hilo exactamente igual que el
 * botón «WhatsApp» de una ficha, sin una copia de la lógica.
 *
 * Sin número conectado → 409 con el enlace oficial wa.me (no se finge una
 * bandeja). Abierta desde una ficha, esa ficha ya es la persona: nunca se
 * crea un lead de más (`createLead` sólo se usa para un teléfono suelto).
 */
export async function openConversation(
  db: any,
  env: Record<string, any>,
  orgId: number,
  input: { clientId?: number | null; leadId?: number | null; phone?: string | null; channelId?: number | null; createLead?: CreateLeadFn },
) {
  const settings = await getCommsSettings(db, orgId)

  let phoneRaw: string | null = input.phone ? String(input.phone) : null
  let clientId: number | null = null
  let leadId: number | null = null
  let name: string | null = null
  if (input.clientId) {
    const rows = await db
      .select({ id: schema.clients.id, name: schema.clients.name, phone: schema.clients.phone })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, Number(input.clientId)), eq(schema.clients.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado' })
    clientId = rows[0].id
    name = rows[0].name
    phoneRaw = phoneRaw || rows[0].phone
  } else if (input.leadId) {
    const rows = await db
      .select({ id: schema.leads.id, name: schema.leads.name, phone: schema.leads.phone })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, Number(input.leadId)), eq(schema.leads.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    leadId = rows[0].id
    name = rows[0].name
    phoneRaw = phoneRaw || rows[0].phone
  }
  if (!phoneRaw) throw createError({ statusCode: 422, statusMessage: 'Esta ficha no tiene teléfono: añádelo antes de escribirle por WhatsApp.' })
  const phone = normalizePhone(phoneRaw, settings.defaultCountryPrefix)
  if (!phone) {
    throw createError({
      statusCode: 422,
      statusMessage: `El teléfono "${phoneRaw}" no tiene prefijo internacional. Escríbelo como +34 600 000 000, o configura el prefijo por defecto en Configuración → Comunicaciones.`,
    })
  }

  const channel = input.channelId ? await loadChannel(db, env, { id: Number(input.channelId), orgId }) : await defaultChannel(db, env, orgId).catch(() => null)
  if (!channel || channel.status !== 'active') {
    throw createError({
      statusCode: 409,
      statusMessage: 'No hay ningún número de WhatsApp conectado en esta agencia.',
      data: { code: 'not_configured', clickToChatUrl: whatsappClickToChatUrl(phone), phone },
    })
  }

  // Abierta desde una ficha, esa ficha ya es la persona: nunca un lead de más.
  const contact = await upsertContact(db, orgId, phone, { displayName: null, createLead: clientId || leadId ? undefined : input.createLead })
  // Si la ficha desde la que se abre no estaba vinculada al contacto, se vincula ahora: es la persona.
  const link: Record<string, any> = {}
  if (clientId && !contact.clientId) link.clientId = clientId
  if (leadId && !contact.leadId) link.leadId = leadId
  if (Object.keys(link).length) await db.update(schema.commsContacts).set({ ...link, updatedAt: now() }).where(eq(schema.commsContacts.id, contact.id))

  const conversation = await findOrCreateConversation(db, orgId, channel.id, contact.id)
  // Núcleo N8a: con el vínculo recién hecho, el Contact queda guardado en el hilo.
  if (Object.keys(link).length) await syncConversationCrmContact(db, orgId, contact.id)
  return { id: conversation.id, contactId: contact.id, channelId: channel.id, created: conversation.created, name, phone }
}

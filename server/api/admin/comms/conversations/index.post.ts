import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv, now, schema, useDb } from '../../../../utils/db'
import { defaultChannel, loadChannel } from '../../../../utils/comms/credentials'
import { findOrCreateConversation, getCommsSettings, upsertContact } from '../../../../utils/comms/inbox'
import { normalizePhone, whatsappClickToChatUrl } from '../../../../utils/comms/phone'

/**
 * POST /api/admin/comms/conversations — abre (o encuentra) la conversación
 * con un cliente, un lead o un teléfono suelto, desde el botón "WhatsApp"
 * de su ficha. Si la agencia no tiene ningún número conectado responde 409
 * con el enlace oficial wa.me para abrir la app de WhatsApp: no hay
 * bandeja, pero tampoco se finge que la hay.
 *
 * Body: { clientId?: number; leadId?: number; phone?: string; channelId?: number }
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const body = (await readBody(event)) || {}
  const settings = await getCommsSettings(db, orgId)

  let phoneRaw: string | null = body.phone ? String(body.phone) : null
  let clientId: number | null = null
  let leadId: number | null = null
  let name: string | null = null
  if (body.clientId) {
    const rows = await db
      .select({ id: schema.clients.id, name: schema.clients.name, phone: schema.clients.phone })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, Number(body.clientId)), eq(schema.clients.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado' })
    clientId = rows[0].id
    name = rows[0].name
    phoneRaw = phoneRaw || rows[0].phone
  } else if (body.leadId) {
    const rows = await db
      .select({ id: schema.leads.id, name: schema.leads.name, phone: schema.leads.phone })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, Number(body.leadId)), eq(schema.leads.organizationId, orgId)))
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

  const channel = body.channelId ? await loadChannel(db, env, { id: Number(body.channelId), orgId }) : await defaultChannel(db, env, orgId).catch(() => null)
  if (!channel || channel.status !== 'active') {
    throw createError({
      statusCode: 409,
      statusMessage: 'No hay ningún número de WhatsApp conectado en esta agencia.',
      data: { code: 'not_configured', clickToChatUrl: whatsappClickToChatUrl(phone), phone },
    })
  }

  const contact = await upsertContact(db, orgId, phone, { displayName: null })
  // Si la ficha desde la que se abre no estaba vinculada al contacto, se vincula ahora: es la persona.
  const link: Record<string, any> = {}
  if (clientId && !contact.clientId) link.clientId = clientId
  if (leadId && !contact.leadId) link.leadId = leadId
  if (Object.keys(link).length) await db.update(schema.commsContacts).set({ ...link, updatedAt: now() }).where(eq(schema.commsContacts.id, contact.id))

  const conversation = await findOrCreateConversation(db, orgId, channel.id, contact.id)
  return { id: conversation.id, contactId: contact.id, channelId: channel.id, created: conversation.created, name, phone }
})

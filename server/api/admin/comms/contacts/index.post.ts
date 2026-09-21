import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { now, schema, useDb } from '../../../../utils/db'
import { crmNamesFor, serializeContact } from '../../../../utils/comms/admin'
import { getCommsSettings, upsertContact } from '../../../../utils/comms/inbox'
import { normalizePhone } from '../../../../utils/comms/phone'

/**
 * POST /api/admin/comms/contacts — el contacto de comunicaciones de un
 * cliente, un lead o un teléfono, creándolo si no existe. No necesita
 * ningún número conectado: es lo que hace falta para registrar una llamada
 * telefónica a mano desde la ficha aunque la agencia no tenga WhatsApp.
 *
 * Body: { clientId?: number; leadId?: number; phone?: string }
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const body = (await readBody(event)) || {}
  const settings = await getCommsSettings(db, orgId)

  let phoneRaw: string | null = body.phone ? String(body.phone) : null
  let clientId: number | null = null
  let leadId: number | null = null
  let displayName: string | null = null
  if (body.clientId) {
    const rows = await db
      .select({ id: schema.clients.id, name: schema.clients.name, phone: schema.clients.phone })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, Number(body.clientId)), eq(schema.clients.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado' })
    clientId = rows[0].id
    displayName = rows[0].name
    phoneRaw = phoneRaw || rows[0].phone
  } else if (body.leadId) {
    const rows = await db
      .select({ id: schema.leads.id, name: schema.leads.name, phone: schema.leads.phone })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, Number(body.leadId)), eq(schema.leads.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    leadId = rows[0].id
    displayName = rows[0].name
    phoneRaw = phoneRaw || rows[0].phone
  }
  if (!phoneRaw) throw createError({ statusCode: 422, statusMessage: 'Esta ficha no tiene teléfono.' })
  const phone = normalizePhone(phoneRaw, settings.defaultCountryPrefix)
  if (!phone) throw createError({ statusCode: 422, statusMessage: `El teléfono "${phoneRaw}" no tiene prefijo internacional (+34…). Corrígelo en la ficha o configura el prefijo por defecto en Configuración → Comunicaciones.` })

  const contact = await upsertContact(db, orgId, phone, { displayName: contact_display(displayName) })
  const link: Record<string, any> = {}
  if (clientId && !contact.clientId) link.clientId = clientId
  if (leadId && !contact.leadId) link.leadId = leadId
  if (Object.keys(link).length) await db.update(schema.commsContacts).set({ ...link, updatedAt: now() }).where(eq(schema.commsContacts.id, contact.id))
  const rows = await db.select().from(schema.commsContacts).where(eq(schema.commsContacts.id, contact.id)).limit(1)
  return { ok: true, contact: serializeContact(rows[0], await crmNamesFor(db, orgId, [rows[0]])) }
})

/** El nombre del CRM no se copia al perfil de WhatsApp: `displayName` es lo que manda el proveedor. */
function contact_display(_name: string | null): null {
  return null
}

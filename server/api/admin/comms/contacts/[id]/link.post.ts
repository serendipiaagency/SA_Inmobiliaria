import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { now, schema, useDb } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'
import { crmNamesFor, loadContactForOrg, serializeContact } from '../../../../../utils/comms/admin'
import { formatPhone } from '../../../../../utils/comms/phone'

/**
 * POST /api/admin/comms/contacts/:id/link — el flujo del contacto
 * desconocido: vincularlo a un cliente o lead existente, crear un lead
 * nuevo con su teléfono, o desvincularlo.
 *
 * Body: { clientId?: number } | { leadId?: number } | { createLead: { name: string; email?: string; notes?: string } } | { unlink: true }
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const contact = await loadContactForOrg(db, orgId, Number(getRouterParam(event, 'id')))
  const body = (await readBody(event)) || {}
  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  let detail = ''

  if (body.unlink) {
    patch.clientId = null
    patch.leadId = null
    detail = 'unlink'
  } else if (body.clientId) {
    const rows = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, Number(body.clientId)), eq(schema.clients.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado' })
    patch.clientId = rows[0].id
    detail = `client:${rows[0].id}`
  } else if (body.leadId) {
    const rows = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, Number(body.leadId)), eq(schema.leads.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
    patch.leadId = rows[0].id
    detail = `lead:${rows[0].id}`
  } else if (body.createLead) {
    const name = String(body.createLead.name || contact.displayName || formatPhone(contact.phoneE164)).trim().slice(0, 200)
    if (!name) throw createError({ statusCode: 422, statusMessage: 'El lead necesita un nombre.' })
    const [lead] = await db
      .insert(schema.leads)
      .values({
        organizationId: orgId,
        name,
        email: body.createLead.email ? String(body.createLead.email).slice(0, 200) : null,
        phone: contact.phoneE164,
        source: 'whatsapp',
        status: 'new',
        score: 10,
        notes: body.createLead.notes ? String(body.createLead.notes).slice(0, 2000) : 'Creado desde una conversación de WhatsApp (Centro de Comunicaciones).',
        lastContactAt: nowTs,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .returning({ id: schema.leads.id })
    patch.leadId = lead.id
    detail = `lead-created:${lead.id}`
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Indica clientId, leadId, createLead o unlink.' })
  }

  await db.update(schema.commsContacts).set(patch).where(eq(schema.commsContacts.id, contact.id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-contact', resourceId: contact.id, detail })
  const updated = await loadContactForOrg(db, orgId, contact.id)
  return { ok: true, contact: serializeContact(updated, await crmNamesFor(db, orgId, [updated])) }
})

import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { crmNamesFor, loadContactForOrg, serializeContact } from '../../../../utils/comms/admin'

/** PATCH /api/admin/comms/contacts/:id — consentimiento (opted_in | opted_out | unknown) y nombre visible. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const contact = await loadContactForOrg(db, orgId, Number(getRouterParam(event, 'id')))
  const body = (await readBody(event)) || {}
  const nowTs = now()
  const patch: Record<string, any> = { updatedAt: nowTs }
  if ('consentStatus' in body) {
    if (!['opted_in', 'opted_out', 'unknown'].includes(String(body.consentStatus))) throw createError({ statusCode: 422, statusMessage: 'Consentimiento no válido' })
    patch.consentStatus = String(body.consentStatus)
    patch.consentSource = `manual:${user.email}`
    patch.consentUpdatedAt = nowTs
  }
  if ('displayName' in body) patch.displayName = body.displayName ? String(body.displayName).slice(0, 120) : null
  if (Object.keys(patch).length === 1) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })
  await db.update(schema.commsContacts).set(patch).where(eq(schema.commsContacts.id, contact.id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-contact', resourceId: contact.id, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') })
  const updated = await loadContactForOrg(db, orgId, contact.id)
  return { ok: true, contact: serializeContact(updated, await crmNamesFor(db, orgId, [updated])) }
})

import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { mergeContacts, ContactMergeError } from '../../../../utils/contacts/merge'
import { orgDefaultCountryPrefix } from '../../../../utils/contacts/service'

/**
 * Fusiona dos Contact. Nunca automático — sólo llega aquí una decisión ya
 * tomada por una persona que ha visto `merge-preview` antes (FASE 14 §109:
 * "nunca fusionar personas automáticamente sólo por heurística").
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ masterId: number; duplicateId: number; fields?: Record<string, string> }>(event)
  if (!Number.isInteger(body?.masterId) || !Number.isInteger(body?.duplicateId)) {
    throw createError({ statusCode: 422, statusMessage: 'Faltan masterId y duplicateId' })
  }

  try {
    const defaultCountryPrefix = await orgDefaultCountryPrefix(event, orgId)
    const merged = await mergeContacts(
      event,
      orgId,
      { masterId: body.masterId, duplicateId: body.duplicateId, fields: body.fields as any },
      { userId: user.id, defaultCountryPrefix },
    )
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'contact', resourceId: body.masterId, detail: `fusionado con #${body.duplicateId}` })
    return merged
  } catch (err) {
    if (err instanceof ContactMergeError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
})

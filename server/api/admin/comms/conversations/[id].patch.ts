import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { loadConversationForOrg } from '../../../../utils/comms/admin'
import { PROPERTY_KINDS } from '../../../../utils/matching/service'
import { assertLiveProperty } from '../../../../utils/properties/trash'
import { loadWebThreadForOrg, parseWebThreadKey, patchWebThread } from '../../../../utils/comms/web'

/**
 * PATCH /api/admin/comms/conversations/:id — estado (open|pending|closed), comercial asignado, propiedad de contexto.
 * Núcleo N8a: con `:id = w<n>`, lo mismo sobre un hilo web (formulario o chat), validado igual en la organización.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
  const webId = parseWebThreadKey(getRouterParam(event, 'id'))
  if (webId) {
    const thread = await loadWebThreadForOrg(db, orgId, webId)
    const changed = await patchWebThread(db, thread, (await readBody(event)) || {})
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-web-thread', resourceId: thread.id, detail: changed.join(',') })
    return { ok: true }
  }
  const id = Number(getRouterParam(event, 'id'))
  const { conversation } = await loadConversationForOrg(db, orgId, id)
  const body = (await readBody(event)) || {}
  const patch: Record<string, any> = { updatedAt: now() }

  if ('status' in body) {
    if (!['open', 'pending', 'closed'].includes(String(body.status))) throw createError({ statusCode: 422, statusMessage: 'Estado no válido' })
    patch.status = String(body.status)
  }
  if ('assignedAgentId' in body) {
    if (body.assignedAgentId == null || body.assignedAgentId === '') {
      patch.assignedAgentId = null
    } else {
      const rows = await db
        .select({ id: schema.teamMembers.id })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.id, Number(body.assignedAgentId)), eq(schema.teamMembers.organizationId, orgId)))
        .limit(1)
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado' })
      patch.assignedAgentId = rows[0].id
    }
  }
  if ('propertyId' in body) {
    if (body.propertyId == null || body.propertyId === '') {
      patch.propertyId = null
      patch.propertyKind = null
    } else {
      const kind = PROPERTY_KINDS.includes(body.propertyKind) ? body.propertyKind : 'developer'
      const propertyId = Number(body.propertyId)
      if (!Number.isInteger(propertyId) || propertyId <= 0) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
      // Vincular el hilo a una propiedad es una relación NUEVA: de la papelera, no.
      await assertLiveProperty(db, orgId, kind, propertyId, { action: 'vincularla a la conversación' })
      patch.propertyId = propertyId
      patch.propertyKind = kind
    }
  }
  if (Object.keys(patch).length === 1) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })

  await db.update(schema.commsConversations).set(patch).where(eq(schema.commsConversations.id, conversation.id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-conversation', resourceId: conversation.id, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') })
  return { ok: true }
})

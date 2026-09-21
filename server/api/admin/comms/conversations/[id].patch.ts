import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { now, schema, useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { loadConversationForOrg } from '../../../../utils/comms/admin'

/** PATCH /api/admin/comms/conversations/:id — estado (open|pending|closed), comercial asignado, propiedad de contexto. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'crm', 'write')
  const db = useDb(event)
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
    } else {
      const rows = await db
        .select({ id: schema.developerProperties.id })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, Number(body.propertyId)), eq(schema.developerProperties.organizationId, orgId)))
        .limit(1)
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
      patch.propertyId = rows[0].id
    }
  }
  if (Object.keys(patch).length === 1) throw createError({ statusCode: 422, statusMessage: 'Nada que actualizar' })

  await db.update(schema.commsConversations).set(patch).where(eq(schema.commsConversations.id, conversation.id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'comms-conversation', resourceId: conversation.id, detail: Object.keys(patch).filter((k) => k !== 'updatedAt').join(',') })
  return { ok: true }
})

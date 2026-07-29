import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { isValidChannelKey } from '../../../utils/publication/channels'
import { logAdminAction } from '../../../utils/audit'

/**
 * POST /api/admin/scheduler/templates — Fase 9. Body: { name, description?, steps }.
 * `steps` is the same shape create.post.ts accepts for a one-off schedule:
 * [{channelKey, offsetMinutes, priority?, action?, dependsOnChannelKey?, condition?}]
 * — saving it here just lets it be reused across properties via templateId.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ name?: string; description?: string; steps?: any[] }>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'name es obligatorio' })
  const steps = Array.isArray(body?.steps) ? body.steps.filter((s) => isValidChannelKey(s?.channelKey)) : []
  if (!steps.length) throw createError({ statusCode: 422, statusMessage: 'Debes indicar al menos un canal en steps' })

  const db = useDb(event)
  const nowTs = now()
  const inserted = await db
    .insert(schema.publicationTemplates)
    .values({
      organizationId: orgId,
      name,
      description: body?.description || null,
      stepsJson: JSON.stringify(steps),
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning({ id: schema.publicationTemplates.id })
  const id = inserted[0].id
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'scheduler-template', resourceId: id })
  return { ok: true, id }
})

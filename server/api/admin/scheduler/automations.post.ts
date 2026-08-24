import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'

const TRIGGERS = ['price_drop', 'status_change']
const ACTIONS = ['update_all', 'update_images', 'update_text', 'unpublish']

/**
 * POST /api/admin/scheduler/automations — Fase 11. Body: {name, triggerType, actionType, enabled?}.
 * When triggerType fires on a property (see server/utils/publication/automations.ts,
 * wired from the developer-properties PUT handler), creates a real schedule
 * with one job per enabled channel using actionType.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ name?: string; triggerType?: string; actionType?: string; enabled?: boolean }>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'name es obligatorio' })
  const triggerType = String(body?.triggerType || '')
  if (!TRIGGERS.includes(triggerType)) throw createError({ statusCode: 422, statusMessage: `triggerType debe ser uno de: ${TRIGGERS.join(', ')}` })
  const actionType = String(body?.actionType || '')
  if (!ACTIONS.includes(actionType)) throw createError({ statusCode: 422, statusMessage: `actionType debe ser uno de: ${ACTIONS.join(', ')}` })

  const db = useDb(event)
  const inserted = await db
    .insert(schema.publicationAutomationRules)
    .values({
      organizationId: orgId,
      name,
      triggerType,
      actionType,
      enabled: body?.enabled === false ? 0 : 1,
      createdAt: now(),
    })
    .returning({ id: schema.publicationAutomationRules.id })
  const id = inserted[0].id
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'scheduler-automation', resourceId: id })
  return { ok: true, id }
})

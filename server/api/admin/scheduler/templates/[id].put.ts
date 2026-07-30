import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { isValidChannelKey } from '../../../../utils/publication/channels'
import { logAdminAction } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const where = and(eq(schema.publicationTemplates.id, id), eq(schema.publicationTemplates.organizationId, orgId))

  const db = useDb(event)
  const existing = await db.select().from(schema.publicationTemplates).where(where).limit(1)
  if (!existing[0]) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })

  const body = await readBody<{ name?: string; description?: string; steps?: any[] }>(event)
  const patch: Record<string, any> = { updatedAt: now() }
  if (body?.name !== undefined) patch.name = String(body.name).trim() || existing[0].name
  if (body?.description !== undefined) patch.description = body.description
  if (Array.isArray(body?.steps)) {
    const steps = body.steps.filter((s) => isValidChannelKey(s?.channelKey))
    if (!steps.length) throw createError({ statusCode: 422, statusMessage: 'Debes indicar al menos un canal en steps' })
    patch.stepsJson = JSON.stringify(steps)
  }

  await db.update(schema.publicationTemplates).set(patch).where(where)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'scheduler-template', resourceId: id })
  return { ok: true }
})

import { requireOrgScope } from '../../../../utils/auth'

/** Toggle an automation on/off. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody(event)
  const enabled = body?.enabled ? 1 : 0
  const result = await raw.prepare('UPDATE automations SET enabled = ?1 WHERE id = ?2 AND organization_id = ?3').bind(enabled, id, orgId).run()
  if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { ok: true, id, enabled }
})

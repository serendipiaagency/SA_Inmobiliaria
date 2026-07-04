import { requireAdmin } from '../../../../utils/auth'

/** Toggle an automation on/off. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody(event)
  const enabled = body?.enabled ? 1 : 0
  await raw.prepare('UPDATE automations SET enabled = ?1 WHERE id = ?2').bind(enabled, id).run()
  return { ok: true, id, enabled }
})

import { requireAdmin } from '../../../../utils/auth'

/** Revoke an API key. Revocation is permanent — keys are never un-revoked. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  await raw.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?1').bind(id).run()
  return { ok: true, id }
})

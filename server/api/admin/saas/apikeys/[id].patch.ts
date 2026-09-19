import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'

/** Revoke an API key. Revocation is permanent — keys are never un-revoked. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const row = await raw.prepare('SELECT prefix, name FROM api_keys WHERE id = ?1 AND organization_id = ?2').bind(id, orgId).first<{ prefix: string; name: string }>()
  const result = await raw.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?1 AND organization_id = ?2').bind(id, orgId).run()
  if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  // Revocar es irreversible: que conste quién lo hizo y a qué clave.
  await logAdminAction(event, { user, orgId, action: 'revoke', resource: 'api-key', resourceId: id, detail: row ? `${row.prefix}… «${row.name}»` : undefined })
  return { ok: true, id }
})

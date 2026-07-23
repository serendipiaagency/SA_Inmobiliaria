import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const rows = (
    await raw
      .prepare(
        `SELECT id, name, prefix, scopes, environment, last_used_at AS lastUsedAt, revoked, created_at AS createdAt
         FROM api_keys WHERE organization_id = ?1 ORDER BY revoked ASC, created_at DESC`,
      )
      .bind(orgId)
      .all<any>()
  ).results
  return { rows }
})

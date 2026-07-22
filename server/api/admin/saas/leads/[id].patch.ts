import { requireOrgScope } from '../../../../utils/auth'
import { now } from '../../../../utils/db'

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

/** Update a lead's pipeline status (drag/drop or dropdown in the UI). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody(event)
  const status = String(body?.status || '')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'Invalid status' })

  const result = await raw
    .prepare('UPDATE leads SET status = ?1, updated_at = ?2 WHERE id = ?3 AND organization_id = ?4')
    .bind(status, now(), id, orgId)
    .run()
  if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { ok: true, id, status }
})

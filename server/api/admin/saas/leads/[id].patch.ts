import { requireAdmin } from '../../../../utils/auth'
import { now } from '../../../../utils/db'

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

/** Update a lead's pipeline status (drag/drop or dropdown in the UI). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const id = parseInt(String(getRouterParam(event, 'id')), 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const body = await readBody(event)
  const status = String(body?.status || '')
  if (!STATUSES.includes(status)) throw createError({ statusCode: 400, statusMessage: 'Invalid status' })

  await raw
    .prepare('UPDATE leads SET status = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(status, now(), id)
    .run()
  return { ok: true, id, status }
})

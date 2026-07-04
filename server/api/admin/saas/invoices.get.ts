import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')
  const where = status && status !== 'all' ? 'WHERE status = ?' : ''
  const binds = status && status !== 'all' ? [status] : []

  const rows = (
    await raw
      .prepare(
        `SELECT id, number, client_name AS clientName, concept, amount, tax, status,
                issued_at AS issuedAt, due_at AS dueAt, paid_at AS paidAt
         FROM invoices ${where} ORDER BY issued_at DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<any>()
  ).results

  const agg = await raw
    .prepare(
      `SELECT coalesce(sum(CASE WHEN status='paid' THEN amount+tax ELSE 0 END),0) AS paid,
              coalesce(sum(CASE WHEN status='pending' THEN amount+tax ELSE 0 END),0) AS pending,
              coalesce(sum(CASE WHEN status='overdue' THEN amount+tax ELSE 0 END),0) AS overdue,
              coalesce(sum(CASE WHEN status='draft' THEN amount+tax ELSE 0 END),0) AS draft,
              count(*) AS total
       FROM invoices`,
    )
    .first<any>()

  return { rows, stats: agg }
})

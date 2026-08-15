import { requireOrgScope } from '../../../utils/auth'

/**
 * Billing list for the active organization.
 *
 * This ran under a plain `requireAdmin` with no tenant filter at all (and the
 * table had no organization_id to filter by) — every tenant's /admin/facturacion
 * listed every other tenant's invoices, client names and amounts, and the
 * aggregate row summed the whole platform's revenue. Migration 0038 adds the
 * column; this scopes both queries to it.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const raw = (event.context as any).cloudflare.env.DB as D1Database
  const q = getQuery(event)
  const status = String(q.status || '')

  const where: string[] = ['organization_id = ?']
  const binds: any[] = [orgId]
  if (status && status !== 'all') {
    where.push('status = ?')
    binds.push(status)
  }
  const clause = `WHERE ${where.join(' AND ')}`

  const rows = (
    await raw
      .prepare(
        `SELECT id, number, client_name AS clientName, concept, amount, tax, status,
                issued_at AS issuedAt, due_at AS dueAt, paid_at AS paidAt
         FROM invoices ${clause} ORDER BY issued_at DESC LIMIT 200`,
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
       FROM invoices WHERE organization_id = ?1`,
    )
    .bind(orgId)
    .first<any>()

  return { rows, stats: agg }
})

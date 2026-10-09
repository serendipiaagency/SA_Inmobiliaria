import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { listSubscriptions, subscriptionsCsv } from '../../../utils/newsletter'

/**
 * GET /api/admin/newsletter — los suscriptores del newsletter de la empresa
 * (Portal Web → Suscriptores). `?status=`, `?q=` (email), `?limit=`,
 * `?offset=`; `?format=csv` descarga todos los del filtro. Nunca los tokens.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const q = getQuery(event)
  const csv = q.format === 'csv'
  const res = await listSubscriptions(useDb(event), orgId, {
    status: typeof q.status === 'string' ? q.status : undefined,
    q: typeof q.q === 'string' ? q.q : undefined,
    limit: csv ? 5000 : Number(q.limit) || 50,
    offset: csv ? 0 : Number(q.offset) || 0,
  })
  if (!csv) return res
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', 'attachment; filename="suscriptores-newsletter.csv"')
  return subscriptionsCsv(res.items)
})

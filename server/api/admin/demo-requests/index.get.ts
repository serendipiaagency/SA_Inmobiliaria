import { requireSuperAdmin } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listDemoRequests } from '../../../utils/demoRequests'

/**
 * GET /api/admin/demo-requests — solicitudes de demo de la landing comercial.
 * Sólo super admin (server/utils/adminRouteMatrix.ts): son de la plataforma,
 * no de ninguna inmobiliaria. `?status=new|contacted|closed`, `?q=` por
 * nombre, correo o inmobiliaria.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const query = getQuery(event)
  return listDemoRequests(useDb(event), {
    status: typeof query.status === 'string' ? query.status : null,
    q: typeof query.q === 'string' ? query.q : null,
    limit: Number(query.limit) || undefined,
  })
})

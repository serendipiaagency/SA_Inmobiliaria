import { requireOrgScope } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { listTours } from '../../../utils/appointments/tours'

/** GET /api/admin/saas/tours — tours de la organización con sus paradas (pages/admin/visitas.vue, pestaña Tours). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await listTours(db, orgId)
  return { rows }
})

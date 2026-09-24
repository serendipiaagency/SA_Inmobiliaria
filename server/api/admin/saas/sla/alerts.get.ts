import { requireOrgScope } from '../../../../utils/auth'
import { openAlerts, refreshAlerts } from '../../../../utils/leads/slaService'

/**
 * Las alertas abiertas, recalculadas al pedirlas.
 *
 * Recalcular aquí es idempotente y evita que el panel enseñe avisos de cosas
 * ya atendidas mientras no pase ninguna tarea programada.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const refreshed = await refreshAlerts(event, orgId)
  const alerts = await openAlerts(event, orgId)
  return { alerts, ...refreshed }
})

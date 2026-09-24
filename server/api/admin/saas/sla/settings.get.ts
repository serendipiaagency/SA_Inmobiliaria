import { requireOrgScope } from '../../../../utils/auth'
import { slaConfig, slaMetrics } from '../../../../utils/leads/slaService'

/** La configuración de plazos y las métricas del periodo. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const [config, metrics] = await Promise.all([slaConfig(event, orgId), slaMetrics(event, orgId)])
  return { config, metrics }
})

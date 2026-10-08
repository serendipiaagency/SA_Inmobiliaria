import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { getSlaSettings } from '../../../../utils/leads/sla'
import { leadScoreSettings } from '../../../../utils/leads/score'

/**
 * GET /api/admin/saas/leads-routing/sla-settings — umbrales de SLA de la
 * organización (con defaults si nunca se configuraron).
 *
 * `?scope=score` (FASE 32): las reglas efectivas del Lead Score, con la
 * fuente de cada señal — en esta misma ruta de configuración de leads, no
 * en una nueva (entonces el margen de claves de ruta era 0; ese límite ya no
 * existe, ver P1-14 en docs/production-hardening-audit.md).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  if (getQuery(event).scope === 'score') return leadScoreSettings(useDb(event), orgId)
  return getSlaSettings(useDb(event), orgId)
})

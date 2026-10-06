import { and, desc, eq, isNull } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { schema, useDb } from '../../../utils/db'
import { automationSummary, decorateAutomations } from '../../../utils/automations/service'

/**
 * Compatibilidad: la página de Automatizaciones usa ahora el motor de
 * recursos (`/api/admin/automations`, bloque N8b). Este endpoint devuelve lo
 * mismo — las reglas de la agencia, sin las borradas, cada una marcada
 * `legacy` si es una demo heredada — y los totales cuentan SÓLO las reales:
 * los contadores inventados de las demo no se suman a nada.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.automations)
    .where(and(eq(schema.automations.organizationId, orgId), isNull(schema.automations.deletedAt)))
    .orderBy(desc(schema.automations.enabled), desc(schema.automations.id))
  const summary = await automationSummary(db, orgId)
  return { rows: await decorateAutomations(db, orgId, rows), totalRuns: summary.totalRuns, active: summary.active, total: summary.total, legacy: summary.legacy }
})

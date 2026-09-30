import { requireOrgScope } from '../../../utils/auth'
import { searchPropertiesCompact } from '../../../utils/properties/searchService'

/**
 * GET /api/admin/comms/properties?q= — el selector de propiedades del hilo,
 * de los dos catálogos (FASE 29 §124/§143: reutiliza el mismo
 * `searchPropertiesCompact()` que ya usa el selector de Calendar, nunca una
 * segunda interpretación de "buscar un inmueble por texto"). Sin enlace
 * público aquí: `buildPropertyShare()` decide si lo hay según el catálogo
 * cuando de verdad se envía.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'crm', 'read')
  const q = String(getQuery(event).q || '').trim()
  const rows = await searchPropertiesCompact(event, orgId, q, 20)
  return { rows }
})

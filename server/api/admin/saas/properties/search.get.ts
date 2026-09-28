import { requireOrgScope } from '../../../../utils/auth'
import { cfEnv } from '../../../../utils/db'
import { searchPropertiesAcrossKinds } from '../../../../utils/properties/search'

/**
 * Búsqueda de inmueble por nombre/zona sobre Propiedades (web) y 2ª mano a la
 * vez — usada por el filtro de Propiedad de Calendar (FASE 20) y por el
 * selector de inmueble al crear una cita desde el panel.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const q = String(getQuery(event).q || '').trim()
  if (!q) return { rows: [] }
  const rows = await searchPropertiesAcrossKinds(cfEnv(event).DB, orgId, q, 20)
  return { rows }
})

import { requireOrgScope } from '../../../../../utils/auth'
import { findRequirementsForProperty, PROPERTY_KINDS, type PropertyKind } from '../../../../../utils/matching/service'

/**
 * Inmueble → compradores compatibles. Mismo motor, dirección contraria.
 *
 * `kind` dice de qué catálogo es el inmueble — Propiedades (web) o 2ª mano
 * (FASE 11: el motor cubre los dos, `agent` por compatibilidad si no se
 * manda, que es como se comportaba este endpoint antes de la migración 0069).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Identificador no válido' })

  const query = getQuery(event)
  const kind = (PROPERTY_KINDS as string[]).includes(String(query.kind)) ? (query.kind as PropertyKind) : 'agent'
  const found = await findRequirementsForProperty(event, orgId, id, kind, {
    includeIneligible: query.includeIneligible === '1' || query.includeIneligible === 'true',
    limit: Math.min(Number(query.limit) || 50, 200),
  })
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Inmueble no encontrado' })

  return { ...found, propertyKind: kind }
})

import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { livePropertyCond } from '../../../utils/properties/trash'
import { loadPublicPropertyDetail } from '../../../utils/properties/publicDetail'
import { SOLAR_DEMO_EXPOSURE } from '../../../../utils/solarExposure'

/**
 * La propiedad de ejemplo de la página «Ficha de propiedad» del Constructor
 * Web, con lo mismo que recibe su ficha pública (loadPublicPropertyDetail):
 * con ella el lienzo avisa de qué secciones no saldrían en la web por falta
 * de datos y pinta la tabla energética real. Es la más reciente de la
 * empresa activa (requireOrgScope), la misma que enseña el lienzo
 * (preview-data: orden por id descendente, fuera de la papelera). Con
 * `propertyId` («Previsualizar con: …»), esa propiedad —sólo si es de la
 * empresa activa—. El color
 * de marca va aparte para el fondo de «Atendido por»: en el panel, la
 * empresa de la web no es la del dominio.
 *
 * «Exposición solar»: si la propiedad no tiene un dato real del proveedor, el
 * lienzo enseña la tarjeta con datos de DEMOSTRACIÓN (`solar.demo`, rotulados
 * como tales) para poder diseñarla; la ficha pública nunca los recibe.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const P = schema.developerProperties
  // «Previsualizar con»: una propiedad concreta, siempre de la empresa activa. Un id ajeno o inexistente no
  // se distingue: 404 para los dos (nunca se confirma que una propiedad de otra empresa exista).
  const rawId = getQuery(event).propertyId
  const wanted = rawId === undefined || rawId === '' ? null : Number(rawId)
  if (wanted !== null && (!Number.isInteger(wanted) || wanted <= 0)) throw createError({ statusCode: 400, statusMessage: 'Propiedad no válida' })
  const pick = wanted !== null ? and(eq(P.organizationId, orgId), eq(P.id, wanted), livePropertyCond(P)) : and(eq(P.organizationId, orgId), livePropertyCond(P))
  const [[project], [org]] = await Promise.all([
    db.select().from(P).where(pick).orderBy(desc(P.id)).limit(1),
    db.select({ brandColor: schema.organizations.brandColor }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1),
  ])
  if (wanted !== null && !project) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
  return {
    brandColor: org?.brandColor || null,
    property: project ? withSolarDemo(await loadPublicPropertyDetail(db, project)) : null,
  }
})

function withSolarDemo<T extends { solar?: unknown; availability?: Record<string, unknown> }>(detail: T): T {
  // El Constructor SIEMPRE muestra datos de demostración rotulados: su fin es diseñar la tarjeta,
  // no enseñar la exposición de esta propiedad (la real —proveedor o estimación— va en la ficha pública).
  return { ...detail, solar: SOLAR_DEMO_EXPOSURE, availability: { ...(detail.availability || {}), solar: true } }
}

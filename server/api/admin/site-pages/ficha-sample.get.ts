import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { livePropertyCond } from '../../../utils/properties/trash'
import { loadPublicPropertyDetail } from '../../../utils/properties/publicDetail'

/**
 * La propiedad de ejemplo de la página «Ficha de propiedad» del Constructor
 * Web, con lo mismo que recibe su ficha pública (loadPublicPropertyDetail):
 * con ella el lienzo avisa de qué secciones no saldrían en la web por falta
 * de datos y pinta la tabla energética real. Es la más reciente de la
 * empresa activa (requireOrgScope), la misma que enseña el lienzo
 * (preview-data: orden por id descendente, fuera de la papelera). El color
 * de marca va aparte para el fondo de «Atendido por»: en el panel, la
 * empresa de la web no es la del dominio.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const P = schema.developerProperties
  const [[project], [org]] = await Promise.all([
    db.select().from(P).where(and(eq(P.organizationId, orgId), livePropertyCond(P))).orderBy(desc(P.id)).limit(1),
    db.select({ brandColor: schema.organizations.brandColor }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1),
  ])
  return {
    brandColor: org?.brandColor || null,
    property: project ? await loadPublicPropertyDetail(db, project) : null,
  }
})

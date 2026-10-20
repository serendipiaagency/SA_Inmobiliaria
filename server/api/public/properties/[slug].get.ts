import { useDb, resolvePublicOrgId } from '../../../utils/db'
import { findPublicPropertyBySlug, loadPublicPropertyDetail } from '../../../utils/properties/publicDetail'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)

  // La propiedad de esta agencia, fuera de la papelera, en cualquiera de los
  // dos catálogos (obra nueva o 2ª mano). Una en la papelera o inexistente: 404.
  const found = await findPublicPropertyBySlug(db, resolvePublicOrgId(event), slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Todo lo demás (multimedia, ficha ampliada, comercial, disponibilidad de
  // secciones…) sale de server/utils/properties/publicDetail.ts, según el catálogo.
  return loadPublicPropertyDetail(db, found.project, found.kind)
})

import { and, asc, desc, gt, lt, ne, eq } from 'drizzle-orm'
import { schema, useDb, resolvePublicOrgId } from '../../../../utils/db'
import { livePropertyCond } from '../../../../utils/properties/trash'
import { findPublicPropertyBySlug } from '../../../../utils/properties/publicDetail'

/**
 * «‹ Anterior» / «Siguiente ›» de la ficha (#111) cuando no se llega desde el
 * catálogo: la propiedad vecina en el orden por defecto del catálogo público
 * (las más recientes primero, `desc(id)`), con sus mismas condiciones — de la
 * agencia que se visita y fuera de la papelera. Dentro del MISMO catálogo que
 * la propiedad (obra nueva con obra nueva, 2ª mano con 2ª mano, y en 2ª mano
 * nada vendido). Sólo nombre y slug.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const found = await findPublicPropertyBySlug(db, orgId, slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const P = found.kind === 'agent' ? (schema.agentProperties as unknown as typeof schema.developerProperties) : schema.developerProperties
  const base = [eq(P.organizationId, orgId), livePropertyCond(P), ...(found.kind === 'agent' ? [ne(P.status, 'sold')] : [])]
  const pick = { slug: P.slug, name: P.name }
  // En el catálogo, «anterior» es la que va delante (id mayor) y «siguiente» la de detrás.
  const [prev] = await db.select(pick).from(P).where(and(gt(P.id, found.project.id), ...base)).orderBy(asc(P.id)).limit(1)
  const [next] = await db.select(pick).from(P).where(and(lt(P.id, found.project.id), ...base)).orderBy(desc(P.id)).limit(1)
  return { prev: prev || null, next: next || null }
})

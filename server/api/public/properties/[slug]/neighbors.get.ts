import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { livePropertyCond } from '../../../../utils/properties/trash'

/**
 * «‹ Anterior» / «Siguiente ›» de la ficha (#111) cuando no se llega desde el
 * catálogo: la propiedad vecina en el orden por defecto del catálogo público
 * (las más recientes primero, `desc(id)`), con sus mismas condiciones — de la
 * agencia que se visita y fuera de la papelera. Sólo nombre y slug.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)
  const P = schema.developerProperties
  const orgId = resolvePublicOrgId(event)
  const base = [eq(P.organizationId, orgId), livePropertyCond(P)]
  const current = (await db.select({ id: P.id }).from(P).where(and(eq(P.slug, slug), ...base)).limit(1))[0]
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const pick = { slug: P.slug, name: P.name }
  // En el catálogo, «anterior» es la que va delante (id mayor) y «siguiente» la de detrás.
  const [prev] = await db.select(pick).from(P).where(and(gt(P.id, current.id), ...base)).orderBy(asc(P.id)).limit(1)
  const [next] = await db.select(pick).from(P).where(and(lt(P.id, current.id), ...base)).orderBy(desc(P.id)).limit(1)
  return { prev: prev || null, next: next || null }
})

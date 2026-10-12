import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { locationIndex, toZoneCard, zoneForLocation, zoneTree } from '../../../utils/zones'
import { firstString } from '../../../../utils/searchState'

/**
 * GET /api/public/zones/for-property?municipality=Gijón&neighborhood=Somió —
 * la guía de zona que corresponde a una ubicación (el barrio si tiene guía,
 * si no el municipio), para el enlace «Descubre cómo es vivir en…» de la
 * ficha pública. Sólo zonas publicadas de la agencia del host; `null` si no hay.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const municipality = firstString(q.municipality).slice(0, 80) || null
  const neighborhood = firstString(q.neighborhood).slice(0, 80) || null
  if (!municipality && !neighborhood) return { zone: null }
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const Z = schema.zones
  const rows = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  if (!rows.length) return { zone: null }
  const tree = zoneTree(rows)
  const zone = zoneForLocation(tree, municipality, neighborhood)
  if (!zone) return { zone: null }
  const card = toZoneCard(zone, tree, await locationIndex(db, orgId))
  const parent = zone.parentId != null ? tree.byId.get(zone.parentId) : undefined
  setHeader(event, 'Cache-Control', 'private, max-age=120')
  return { zone: { ...card, parentName: parent?.name ?? null } }
})

import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { locationIndex, parseJsonArray, resolveZonePath, toZoneCard, zoneCatalogUrl, zoneMatch, zonePath, zoneProperties, zoneTree, type ZoneFaq, type ZoneSection } from '../../../utils/zones'

/**
 * GET /api/public/zones/<región>/<municipio>[/<barrio>] — la guía de una
 * zona publicada de la agencia del host: texto, foto, mapa, migas, barrios y
 * localidades (hijas publicadas con su recuento real), zonas cercanas (las
 * hermanas), las propiedades que el catálogo enseñaría con su filtro y el
 * enlace a ese catálogo. 404 si no existe o no está publicada.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') || ''
  const segments = raw.split('/').map((s) => s.trim()).filter(Boolean)
  if (!segments.length || segments.length > 4) throw createError({ statusCode: 404, statusMessage: 'Zona no encontrada' })
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const Z = schema.zones
  const rows = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  const tree = zoneTree(rows)
  const zone = resolveZonePath(tree, segments)
  if (!zone) throw createError({ statusCode: 404, statusMessage: 'Zona no encontrada' })
  const entries = await locationIndex(db, orgId)

  const crumbs: Array<{ name: string; path: string }> = []
  let cur: typeof zone | undefined = zone
  while (cur) {
    crumbs.unshift({ name: cur.name, path: zonePath(cur, tree) })
    cur = cur.parentId != null ? tree.byId.get(cur.parentId) : undefined
  }
  const parent = zone.parentId != null ? tree.byId.get(zone.parentId) : undefined
  const children = (tree.children.get(zone.id) || []).map((z) => toZoneCard(z, tree, entries))
  const nearby = parent
    ? (tree.children.get(parent.id) || []).filter((z) => z.id !== zone.id && z.kind === zone.kind).sort((a, b) => Number(b.area === zone.area) - Number(a.area === zone.area)).slice(0, 6).map((z) => toZoneCard(z, tree, entries))
    : []
  const properties = zone.kind === 'region' ? [] : await zoneProperties(db, orgId, zone, tree, 6)
  const card = toZoneCard(zone, tree, entries)
  const match = zoneMatch(zone, tree)

  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return {
    zone: {
      ...card,
      intro: zone.intro,
      sections: parseJsonArray<ZoneSection>(zone.sectionsJson),
      faq: parseJsonArray<ZoneFaq>(zone.faqJson),
      gallery: parseJsonArray<string>(zone.galleryJson),
      seoTitle: zone.seoTitle,
      seoDescription: zone.seoDescription,
      lat: zone.lat,
      lng: zone.lng,
      zoom: zone.zoom,
      reviewedAt: zone.reviewedAt,
      updatedAt: zone.updatedAt,
      match,
    },
    breadcrumbs: crumbs,
    children,
    nearby,
    properties,
    catalogUrl: zoneCatalogUrl(zone, tree),
  }
})

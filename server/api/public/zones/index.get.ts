import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { locationIndex, parseJsonArray, resolveZonePath, toZoneCard, zoneAreaLabel, zoneTree, type ZoneCard } from '../../../utils/zones'
import { firstString } from '../../../../utils/searchState'

/**
 * GET /api/public/zones?region=asturias — el directorio de una región de la
 * agencia del host: la región (con su guía), sus municipios y localidades
 * agrupados por área, cada uno con su ruta, su foto y el número real de
 * propiedades publicadas (del índice del catálogo). Sólo zonas publicadas de
 * ESTA organización; sin región, las regiones publicadas.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const Z = schema.zones
  const rows = await db.select().from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt)))
  const tree = zoneTree(rows)
  const entries = await locationIndex(db, orgId)
  const regionSlug = firstString(getQuery(event).region)

  if (!regionSlug) {
    return { regions: (tree.children.get(null) || []).map((z) => toZoneCard(z, tree, entries)) }
  }
  const region = resolveZonePath(tree, [regionSlug])
  if (!region || region.kind !== 'region') throw createError({ statusCode: 404, statusMessage: 'Zona no encontrada' })

  const municipalities = (tree.children.get(region.id) || []).map((z) => toZoneCard(z, tree, entries))
  const groups: Array<{ area: string | null; label: string | null; zones: ZoneCard[] }> = []
  for (const card of municipalities) {
    let g = groups.find((x) => x.area === card.area)
    if (!g) {
      g = { area: card.area, label: zoneAreaLabel(card.area), zones: [] }
      groups.push(g)
    }
    g.zones.push(card)
  }
  setHeader(event, 'Cache-Control', 'private, max-age=60')
  return {
    region: { ...toZoneCard(region, tree, entries), intro: region.intro, seoTitle: region.seoTitle, seoDescription: region.seoDescription, sections: parseJsonArray(region.sectionsJson), faq: parseJsonArray(region.faqJson), reviewedAt: region.reviewedAt },
    groups,
    total: municipalities.reduce((s, z) => s + z.count, 0),
  }
})

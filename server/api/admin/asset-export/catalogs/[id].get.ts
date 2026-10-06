import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { useDb, schema } from '../../../../utils/db'
import { catalogPropertyKind } from '../../../../utils/assetExport/catalogKind'
import { agentCatalogTitle } from '../../../../utils/assetExport/bindings'
import { inJsonList } from '../../../../utils/sqlChunks'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, id)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })

  // FASE 28: el catálogo puede ser de obra nueva o de 2ª mano. El nombre de
  // cada sección se busca en SU tabla y siempre dentro de la agencia: un join
  // sólo por id pintaba el nombre de una propiedad de otra agencia (u otro
  // catálogo) con el mismo número.
  const propertyKind = catalogPropertyKind(catalog)
  const rows = await db
    .select({
      id: schema.assetExportCatalogItems.id,
      position: schema.assetExportCatalogItems.position,
      assetId: schema.assetExportCatalogItems.assetId,
      title: schema.assetExportCatalogItems.title,
      status: schema.assetExportCatalogItems.status,
      pageCount: schema.assetExportCatalogItems.pageCount,
      errorMessage: schema.assetExportCatalogItems.errorMessage,
    })
    .from(schema.assetExportCatalogItems)
    .where(eq(schema.assetExportCatalogItems.catalogId, id))
    .orderBy(schema.assetExportCatalogItems.position)
    .limit(200)

  const assetIds = [...new Set(rows.map((r) => r.assetId))]
  const names = new Map<number, string>()
  if (assetIds.length && propertyKind === 'agent') {
    const A = schema.agentProperties
    const found = await db
      .select({ id: A.id, propertyType: A.propertyType, street: A.street, community: A.community, district: A.district, city: A.city, locationPrivacy: A.locationPrivacy })
      .from(A)
      .where(and(eq(A.organizationId, orgId), inJsonList(A.id, assetIds)))
    for (const p of found) names.set(p.id, agentCatalogTitle(p))
  } else if (assetIds.length) {
    const D = schema.developerProperties
    const found = await db.select({ id: D.id, name: D.name }).from(D).where(and(eq(D.organizationId, orgId), inJsonList(D.id, assetIds)))
    for (const p of found) names.set(p.id, p.name)
  }

  const items = rows.map(({ title, ...r }) => ({ ...r, assetName: names.get(r.assetId) ?? title ?? null }))
  return { ...catalog, propertyKind, items }
})

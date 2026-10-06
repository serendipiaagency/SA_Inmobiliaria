import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { livePropertyCond } from '../../../../utils/properties/trash'

function findLastPriceDrop(history: { price: number; recordedAt: string }[]): { amount: number; date: string } | null {
  let drop: { amount: number; date: string } | null = null
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]
    const curr = history[i]
    if (curr.price < prev.price) drop = { amount: Math.round(prev.price - curr.price), date: curr.recordedAt }
  }
  return drop
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const rows = await db
    .select({ id: schema.developerProperties.id, viewCount: schema.developerProperties.viewCount, favoriteCount: schema.developerProperties.favoriteCount })
    .from(schema.developerProperties)
    // Una propiedad en la papelera responde 404, igual que una que no existe.
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, orgId), livePropertyCond(schema.developerProperties)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)

  const [leadRows, weekViewRows, visitRows, history] = await Promise.all([
    // Sólo los leads de ESTA propiedad de obra nueva (migración 0089): no los de un piso de 2ª mano con el mismo id. Los antiguos sin catálogo cuentan, como siempre.
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.leads)
      .where(and(eq(schema.leads.propertyId, project.id), eq(schema.leads.organizationId, orgId), or(eq(schema.leads.propertyKind, 'developer'), isNull(schema.leads.propertyKind)))),
    db.select({ count: sql<number>`count(*)` }).from(schema.propertyViews).where(sql`${schema.propertyViews.developerPropertyId} = ${project.id} and ${schema.propertyViews.createdAt} >= ${weekAgo}`),
    db.select({ count: sql<number>`count(*)` }).from(schema.visits).where(and(eq(schema.visits.propertyId, project.id), eq(schema.visits.organizationId, orgId), isNull(schema.visits.deletedAt))),
    db.select({ price: schema.priceHistory.price, recordedAt: schema.priceHistory.recordedAt }).from(schema.priceHistory).where(eq(schema.priceHistory.developerPropertyId, project.id)).orderBy(asc(schema.priceHistory.recordedAt)),
  ])

  return {
    viewCount: project.viewCount,
    viewsThisWeek: weekViewRows[0]?.count || 0,
    favoriteCount: project.favoriteCount,
    leadCount: leadRows[0]?.count || 0,
    visitsBooked: visitRows[0]?.count || 0,
    priceDrop: findLastPriceDrop(history),
  }
})

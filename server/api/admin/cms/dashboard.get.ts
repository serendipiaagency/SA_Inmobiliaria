import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const A = schema.cmsArticles

  const [byStatus, totals, recentComments, topArticles] = await Promise.all([
    db
      .select({ status: A.status, n: sql<number>`count(*)` })
      .from(A)
      .where(and(eq(A.organizationId, orgId), isNull(A.deletedAt)))
      .groupBy(A.status),
    db
      .select({
        articles: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${A.viewCount}), 0)`,
        avgSeo: sql<number>`coalesce(avg(${A.seoScore}), 0)`,
      })
      .from(A)
      .where(and(eq(A.organizationId, orgId), isNull(A.deletedAt))),
    db
      .select({
        id: schema.cmsComments.id,
        authorName: schema.cmsComments.authorName,
        content: schema.cmsComments.content,
        status: schema.cmsComments.status,
        createdAt: schema.cmsComments.createdAt,
        articleTitle: A.title,
      })
      .from(schema.cmsComments)
      .leftJoin(A, eq(schema.cmsComments.articleId, A.id))
      .where(eq(schema.cmsComments.organizationId, orgId))
      .orderBy(desc(schema.cmsComments.id))
      .limit(5),
    db
      .select({ id: A.id, title: A.title, slug: A.slug, viewCount: A.viewCount })
      .from(A)
      .where(and(eq(A.organizationId, orgId), eq(A.status, 'published'), isNull(A.deletedAt)))
      .orderBy(desc(A.viewCount))
      .limit(5),
  ])

  const counts: Record<string, number> = { draft: 0, scheduled: 0, published: 0 }
  for (const r of byStatus) counts[r.status] = r.n

  return {
    counts,
    totalArticles: totals[0]?.articles ?? 0,
    totalViews: totals[0]?.views ?? 0,
    avgSeoScore: Math.round(totals[0]?.avgSeo ?? 0),
    recentComments,
    topArticles,
  }
})

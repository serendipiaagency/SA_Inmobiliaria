import { and, eq, gte, sql } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId } from '../../../../utils/db'
import { getOrSetVisitorId } from '../../../../utils/visitor'
import { rateLimit } from '../../../../utils/rateLimit'

// A "view" conventionally means a distinct visit, not every page load a
// script (or an impatient human hitting refresh) can trigger — dedupe the
// same visitor viewing the same property again within this window instead
// of counting every request (docs/production-hardening-audit.md, P1-6).
const DEDUP_WINDOW_MINUTES = 30

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'property-view', { limit: 30, windowSeconds: 600 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db
    .select({ id: schema.developerProperties.id })
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event))))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const visitorId = getOrSetVisitorId(event)
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000).toISOString().replace('T', ' ').slice(0, 19)
  const recent = await db
    .select({ id: schema.propertyViews.id })
    .from(schema.propertyViews)
    .where(and(eq(schema.propertyViews.developerPropertyId, project.id), eq(schema.propertyViews.visitorId, visitorId), gte(schema.propertyViews.createdAt, cutoff)))
    .limit(1)
  if (recent.length) return { ok: true, counted: false }

  await db
    .update(schema.developerProperties)
    .set({ viewCount: sql`${schema.developerProperties.viewCount} + 1` })
    .where(eq(schema.developerProperties.id, project.id))
  await db.insert(schema.propertyViews).values({ developerPropertyId: project.id, visitorId, createdAt: now() })
  return { ok: true, counted: true }
})

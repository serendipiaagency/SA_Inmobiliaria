import { and, eq, gte, sql } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId } from '../../../../utils/db'
import { livePropertyCond } from '../../../../utils/properties/trash'
import { getOrSetVisitorId } from '../../../../utils/visitor'
import { rateLimit } from '../../../../utils/rateLimit'
import { recordPropertyShareLinkOpen } from '../../../../utils/comms/shareLinks'

// A "view" conventionally means a distinct visit, not every page load a
// script (or an impatient human hitting refresh) can trigger — dedupe the
// same visitor viewing the same property again within this window instead
// of counting every request (docs/production-hardening-audit.md, P1-6).
const DEDUP_WINDOW_MINUTES = 30

/**
 * POST /api/public/properties/:slug/view — cuenta una visita a la ficha.
 *
 * Núcleo N8a (FASE 32): con `{ f: <token> }` registra además la apertura del
 * ENLACE PERSONAL que se le envió a alguien por email o por el chat web
 * (server/utils/comms/shareLinks.ts). El token sólo cuenta si es de esta
 * agencia (la del host) y de esta misma propiedad; si no, se ignora en
 * silencio y la visita se cuenta igual que siempre. La llamada la hace la
 * página al pintarse en el navegador, no el GET del enlace.
 */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'property-view', { limit: 30, windowSeconds: 600 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  const rows = await db
    .select({ id: schema.developerProperties.id })
    .from(schema.developerProperties)
    // Una propiedad en la papelera responde 404, igual que una que no existe.
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, orgId), livePropertyCond(schema.developerProperties)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const body = ((await readBody(event).catch(() => null)) || {}) as Record<string, unknown>
  const personal = body.f ? await recordPropertyShareLinkOpen(db, orgId, project.id, body.f) : { counted: false }

  const visitorId = getOrSetVisitorId(event)
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000).toISOString().replace('T', ' ').slice(0, 19)
  const recent = await db
    .select({ id: schema.propertyViews.id })
    .from(schema.propertyViews)
    .where(and(eq(schema.propertyViews.developerPropertyId, project.id), eq(schema.propertyViews.visitorId, visitorId), gte(schema.propertyViews.createdAt, cutoff)))
    .limit(1)
  if (recent.length) return { ok: true, counted: false, personalLink: personal.counted }

  await db
    .update(schema.developerProperties)
    .set({ viewCount: sql`${schema.developerProperties.viewCount} + 1` })
    .where(eq(schema.developerProperties.id, project.id))
  await db.insert(schema.propertyViews).values({ developerPropertyId: project.id, visitorId, createdAt: now() })
  return { ok: true, counted: true, personalLink: personal.counted }
})

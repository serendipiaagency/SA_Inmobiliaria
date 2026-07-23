import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../utils/db'

const SKIP_PREFIXES = ['/api/', '/admin/', '/_nuxt/', '/_ipx/', '/cdn-cgi/']

/**
 * Real 301/302 enforcement for redirect rules created in the CMS admin
 * (Fase "Redirecciones") — without this, the rules only ever lived in the
 * database and never affected an actual visitor's request.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  const path = getRequestURL(event).pathname
  if (path === '/' || SKIP_PREFIXES.some((p) => path.startsWith(p)) || /\.[a-z0-9]{2,5}$/i.test(path)) return

  try {
    const db = useDb(event)
    const orgId = resolvePublicOrgId(event)
    const rows = await db
      .select({ toPath: schema.cmsRedirects.toPath, statusCode: schema.cmsRedirects.statusCode, id: schema.cmsRedirects.id })
      .from(schema.cmsRedirects)
      .where(and(eq(schema.cmsRedirects.organizationId, orgId), eq(schema.cmsRedirects.fromPath, path)))
      .limit(1)
    const rule = rows[0]
    if (!rule) return

    await db
      .update(schema.cmsRedirects)
      .set({ hits: sql`${schema.cmsRedirects.hits} + 1` })
      .where(eq(schema.cmsRedirects.id, rule.id))

    return sendRedirect(event, rule.toPath, (rule.statusCode as 301 | 302) || 301)
  } catch {
    // A redirect-lookup failure must never take the whole site down — fall through to normal routing.
  }
})

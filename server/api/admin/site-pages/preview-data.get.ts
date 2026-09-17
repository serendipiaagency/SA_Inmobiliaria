import { and, asc, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { attachPhotos } from '../../../utils/photos'
import { PUBLIC_TEAM_COLUMNS } from '../../../utils/publicTeam'

/**
 * Same shape as /api/public/home, but scoped to the admin's own active
 * organization (requireOrgScope) instead of resolvePublicOrgId — the
 * builder canvas must preview real data for the org being edited
 * regardless of which hostname the admin panel itself is served from.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)

  const [projects, communities, blogs, team] = await Promise.all([
    db.select().from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, orgId)).orderBy(desc(schema.developerProperties.id)).limit(12),
    db.select().from(schema.communities).where(eq(schema.communities.organizationId, orgId)).orderBy(desc(schema.communities.id)).limit(6),
    db.select().from(schema.blogs).where(eq(schema.blogs.organizationId, orgId)).orderBy(desc(schema.blogs.id)).limit(3),
    // Idéntico a /api/public/home: el lienzo tiene que ver exactamente lo
    // que verá el visitante, incluida la misma proyección de columnas.
    db
      .select(PUBLIC_TEAM_COLUMNS)
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.showOnWeb, 1)))
      .orderBy(asc(schema.teamMembers.sortOrder), asc(schema.teamMembers.name))
      .limit(12),
  ])

  const blogIds = blogs.map((b) => b.id)
  const blogTitles: Record<number, { title: string; description: string }> = {}
  if (blogIds.length) {
    const trs = await db.select().from(schema.blogTranslations)
    for (const tr of trs) {
      if (blogIds.includes(tr.blogId) && (tr.locale === 'en' || !blogTitles[tr.blogId])) {
        blogTitles[tr.blogId] = { title: tr.title, description: tr.description }
      }
    }
  }

  return {
    projects: await attachPhotos(db, projects),
    communities,
    blogs: blogs.map((b) => ({ ...b, ...blogTitles[b.id] })),
    team,
  }
})

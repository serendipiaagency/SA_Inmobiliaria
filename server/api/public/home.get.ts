import { and, asc, desc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'
import { PUBLIC_TEAM_COLUMNS } from '../../utils/publicTeam'
import { toPublicProperties } from '../../utils/propertyPrivacy'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [projects, communities, developers, blogs, team] = await Promise.all([
    db.select().from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, orgId)).orderBy(desc(schema.developerProperties.id)).limit(12),
    db.select().from(schema.communities).where(eq(schema.communities.organizationId, orgId)).orderBy(desc(schema.communities.id)).limit(6),
    db
      .select()
      .from(schema.developers)
      .where(and(eq(schema.developers.status, 'active'), eq(schema.developers.organizationId, orgId)))
      .orderBy(desc(schema.developers.id))
      .limit(12),
    db.select().from(schema.blogs).where(eq(schema.blogs.organizationId, orgId)).orderBy(desc(schema.blogs.id)).limit(3),
    // Comerciales publicados, en el orden que fija la propia agencia. Mismo
    // criterio y misma proyección que /api/public/team — nunca `select()` a
    // secas sobre team_members (ver server/utils/publicTeam.ts).
    db
      .select(PUBLIC_TEAM_COLUMNS)
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.showOnWeb, 1)))
      .orderBy(asc(schema.teamMembers.sortOrder), asc(schema.teamMembers.name))
      .limit(12),
  ])

  const blogIds = blogs.map((b) => b.id)
  let blogTitles: Record<number, { title: string; description: string }> = {}
  if (blogIds.length) {
    const trs = await db.select().from(schema.blogTranslations)
    for (const tr of trs) {
      if (blogIds.includes(tr.blogId) && (tr.locale === 'en' || !blogTitles[tr.blogId])) {
        blogTitles[tr.blogId] = { title: tr.title, description: tr.description }
      }
    }
  }

  return {
    projects: toPublicProperties(await attachPhotos(db, projects)),
    communities,
    developers,
    blogs: blogs.map((b) => ({ ...b, ...blogTitles[b.id] })),
    team,
  }
})

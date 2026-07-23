import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { attachPhotos } from '../../utils/photos'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [projects, communities, developers, blogs] = await Promise.all([
    db.select().from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, orgId)).orderBy(desc(schema.developerProperties.id)).limit(12),
    db.select().from(schema.communities).where(eq(schema.communities.organizationId, orgId)).orderBy(desc(schema.communities.id)).limit(6),
    db
      .select()
      .from(schema.developers)
      .where(and(eq(schema.developers.status, 'active'), eq(schema.developers.organizationId, orgId)))
      .orderBy(desc(schema.developers.id))
      .limit(12),
    db.select().from(schema.blogs).where(eq(schema.blogs.organizationId, orgId)).orderBy(desc(schema.blogs.id)).limit(3),
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
    projects: await attachPhotos(db, projects),
    communities,
    developers,
    blogs: blogs.map((b) => ({ ...b, ...blogTitles[b.id] })),
  }
})

import { and, eq, isNull } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../utils/db'

const STATIC_PATHS = [
  '/demo',
  '/demo/properties',
  '/demo/mapa',
  '/demo/project-community',
  '/demo/developer-list',
  '/demo/leadership',
  '/demo/blog',
  '/demo/about-us',
  '/demo/contact-us',
  '/demo/visitor',
  '/demo/vendors/registration',
  '/demo/privacy',
  '/demo/terms',
]

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Dynamic sitemap built from live D1 content — keeps search engines pointed at real, current pages. */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const origin = getRequestURL(event).origin
  const orgId = resolvePublicOrgId(event)

  const [properties, blogPosts, team, communities, cmsArticles, cmsAuthors] = await Promise.all([
    db.select({ slug: schema.developerProperties.slug }).from(schema.developerProperties).where(eq(schema.developerProperties.organizationId, orgId)).all(),
    db.select({ slug: schema.blogs.slug }).from(schema.blogs).where(eq(schema.blogs.organizationId, orgId)).all(),
    db.select({ slug: schema.teamMembers.slug }).from(schema.teamMembers).where(eq(schema.teamMembers.organizationId, orgId)).all(),
    db.select({ id: schema.communities.id }).from(schema.communities).where(eq(schema.communities.organizationId, orgId)).all(),
    db
      .select({ slug: schema.cmsArticles.slug })
      .from(schema.cmsArticles)
      .where(and(eq(schema.cmsArticles.organizationId, orgId), eq(schema.cmsArticles.status, 'published'), isNull(schema.cmsArticles.deletedAt)))
      .all(),
    db.select({ slug: schema.cmsAuthors.slug }).from(schema.cmsAuthors).where(eq(schema.cmsAuthors.organizationId, orgId)).all(),
  ])

  const urls: string[] = [...STATIC_PATHS.map((p) => `${origin}${p}`)]
  for (const p of properties) if (p.slug) urls.push(`${origin}/demo/property-details/${p.slug}`)
  for (const b of blogPosts) if (b.slug) urls.push(`${origin}/demo/blog/${b.slug}`)
  for (const m of team) if (m.slug) urls.push(`${origin}/demo/leadership/${m.slug}`)
  for (const c of communities) urls.push(`${origin}/demo/community/${c.id}`)
  for (const a of cmsArticles) if (a.slug) urls.push(`${origin}/demo/blog/${a.slug}`)
  for (const a of cmsAuthors) if (a.slug) urls.push(`${origin}/demo/blog/autor/${a.slug}`)

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n')}
</urlset>`

  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return body
})

import { useDb, schema } from '../utils/db'

const STATIC_PATHS = [
  '/',
  '/properties',
  '/mapa',
  '/project-community',
  '/developer-list',
  '/leadership',
  '/blog',
  '/about-us',
  '/contact-us',
  '/visitor',
  '/vendors/registration',
  '/privacy',
  '/terms',
]

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Dynamic sitemap built from live D1 content — keeps search engines pointed at real, current pages. */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const origin = getRequestURL(event).origin

  const [properties, blogPosts, team, communities] = await Promise.all([
    db.select({ slug: schema.developerProperties.slug }).from(schema.developerProperties).all(),
    db.select({ slug: schema.blogs.slug }).from(schema.blogs).all(),
    db.select({ slug: schema.teamMembers.slug }).from(schema.teamMembers).all(),
    db.select({ id: schema.communities.id }).from(schema.communities).all(),
  ])

  const urls: string[] = [...STATIC_PATHS.map((p) => `${origin}${p}`)]
  for (const p of properties) if (p.slug) urls.push(`${origin}/property-details/${p.slug}`)
  for (const b of blogPosts) if (b.slug) urls.push(`${origin}/blog/${b.slug}`)
  for (const m of team) if (m.slug) urls.push(`${origin}/leadership/${m.slug}`)
  for (const c of communities) urls.push(`${origin}/community/${c.id}`)

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n')}
</urlset>`

  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return body
})

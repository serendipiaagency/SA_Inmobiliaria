import { eq, ne } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { attachPhotos } from '../../../../utils/photos'
import { explainSimilarity, type SimilarityFacts } from '../../../../utils/ai'

/**
 * Real similar-property ranking: a deterministic attribute-similarity score
 * (community match, price proximity, bedroom match, area proximity) over the
 * actual catalog — never a fabricated "similar" list. The one-line rationale
 * per result is generated from those same real facts (Claude if configured,
 * otherwise the rules-based fallback), through the shared AI engine.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const P = schema.developerProperties
  const rows = await db.select().from(P).where(eq(P.slug, slug)).limit(1)
  const base = rows[0]
  if (!base) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const candidateRows = await db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    .where(ne(P.id, base.id))
  const candidates = candidateRows.map((r: any) => ({ ...r.project, developerName: r.developerName }))

  const scored = candidates
    .map((c: any) => {
      const sameCommunity = !!base.community && c.community === base.community
      const priceDiffPct = base.price && c.price ? ((c.price - base.price) / base.price) * 100 : null
      const bedroomDiff = base.bedrooms != null && c.bedrooms != null ? c.bedrooms - base.bedrooms : null
      const areaDiffPct = base.area && c.area ? ((c.area - base.area) / base.area) * 100 : null

      let score = 0
      if (sameCommunity) score += 40
      if (priceDiffPct != null) score += Math.max(0, 30 - Math.abs(priceDiffPct) * 0.6)
      if (bedroomDiff != null) score += bedroomDiff === 0 ? 20 : Math.abs(bedroomDiff) === 1 ? 10 : 0
      if (areaDiffPct != null) score += Math.max(0, 10 - Math.abs(areaDiffPct) * 0.2)

      const facts: SimilarityFacts = { sameCommunity, priceDiffPct, bedroomDiff, areaDiffPct }
      return { project: c, score, facts }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const withPhotos = await attachPhotos(
    db,
    scored.map((s) => s.project),
  )

  const results = await Promise.all(
    scored.map(async (s, i) => {
      const { text, engine } = await explainSimilarity(event, base, s.project, s.facts)
      return { ...withPhotos[i], similarityReason: text, similarityEngine: engine }
    }),
  )

  return { results }
})

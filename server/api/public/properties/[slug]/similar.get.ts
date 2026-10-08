import { and, desc, eq, ne, notInArray, sql } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { attachPhotos } from '../../../../utils/photos'
import { explainSimilarity, type SimilarityFacts } from '../../../../utils/ai'
import { toPublicProperty } from '../../../../utils/propertyPrivacy'
import { livePropertyCond } from '../../../../utils/properties/trash'

/**
 * Real similar-property ranking: a deterministic attribute-similarity score
 * (community match, price proximity, bedroom match, area proximity) over the
 * actual catalog — never a fabricated "similar" list. The one-line rationale
 * per result is generated from those same real facts (Claude if configured,
 * otherwise the rules-based fallback), through the shared AI engine.
 *
 * `featured` — «Propiedades destacadas», debajo de las similares en la ficha:
 * otro concepto (no «parecidas a esta», sino las que la inmobiliaria
 * destaca). La marca que ya existe para eso es `isExclusive` («Exclusiva»:
 * la misma que usa la selección «Destacadas» del bloque Propiedades del
 * Constructor, utils/siteBuilder/pickItems.ts). Sin la propiedad que se está
 * viendo ni las similares, de esta agencia y vivas; si no hay ninguna, la
 * lista va vacía y la ficha no pinta la sección. Va en esta respuesta y no
 * en una ruta propia para poder excluir las similares sin calcularlas dos
 * veces.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const P = schema.developerProperties
  const orgId = resolvePublicOrgId(event)
  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const rows = await db.select().from(P).where(and(eq(P.slug, slug), eq(P.organizationId, orgId), livePropertyCond(P))).limit(1)
  const base = rows[0]
  if (!base) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Bounded scan: same-community candidates first (they score highest anyway),
  // capped well above what any realistic catalog needs to rank well, so this
  // never degrades into a full-table pull as the catalog grows.
  const candidateRows = await db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    // Candidates come from this tenant's own catalog only — a "similar
    // property" from another agency would be both a leak and an advert for a
    // competitor's listing.
    .where(and(ne(P.id, base.id), eq(P.organizationId, orgId), livePropertyCond(P)))
    .orderBy(sql`case when ${P.community} = ${base.community} then 0 else 1 end`)
    .limit(200)
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
      return { ...toPublicProperty(withPhotos[i]), similarityReason: text, similarityEngine: engine }
    }),
  )

  const FEATURED_LIMIT = 3
  const excluded = [base.id, ...scored.map((s) => s.project.id)]
  const featuredRows = await db
    .select({ project: P, developerName: schema.developers.name })
    .from(P)
    .leftJoin(schema.developers, eq(P.developerId, schema.developers.id))
    .where(and(eq(P.organizationId, orgId), eq(P.isExclusive, 1), notInArray(P.id, excluded), livePropertyCond(P)))
    .orderBy(desc(P.id))
    .limit(FEATURED_LIMIT)
  const featured = (await attachPhotos(db, featuredRows.map((r: any) => ({ ...r.project, developerName: r.developerName })))).map((p: any) => toPublicProperty(p))

  return { results, featured }
})

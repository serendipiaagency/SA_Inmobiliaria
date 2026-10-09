import type { MarketStats } from './market'

/**
 * "Serendipia Score" — a transparent, reproducible index computed only from
 * real attributes already stored on the property (and real community
 * comparables). Every sub-score states the real input value it came from and
 * the formula that produced it, so nothing here is a fabricated or
 * black-box number. A sub-score is omitted (not defaulted to 0 or 50) when
 * its underlying data doesn't exist.
 *
 * `label` and `detail` are the Spanish sentences (kept as they were, for
 * whoever already reads them). The public site composes its own sentence in
 * the visitor's language from `key` (the factor), `reason` (a stable key for
 * why it says what it says) and `data` (the real inputs of that sentence):
 * composables/useScoreText.ts.
 */

export type AmenityCode = 'pool' | 'garage' | 'terrace' | 'garden' | 'elevator' | 'accessible' | 'pets'

export interface ScoreTextData {
  /** €/m² frente a la media de la zona, en % con signo (negativo = más barata). */
  pctVsZone?: number
  comparableCount?: number
  rentalYield?: number | null
  amenities?: AmenityCode[]
  energyRating?: string | null
  status?: string
  overall?: number
  /** Rentabilidad frente a la media de la zona, en puntos con un decimal. */
  yieldVsZone?: 'above' | 'below'
  yieldDiffPts?: number
  isExclusive?: boolean
  priceVsZone?: 'above' | 'below' | 'aligned'
}

export interface ScoreBreakdownItem {
  key: string
  label: string
  score: number
  detail: string
  reason: string
  data: ScoreTextData
}

export interface SerendipiaScore {
  overall: number | null
  breakdown: ScoreBreakdownItem[]
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v))
}

/** Sin «−0»: un redondeo a cero es cero. */
const noNegZero = (n: number) => (n === 0 ? 0 : n)

/** De `status` de la propiedad a la clave del motivo (camelCase, como el resto de claves). */
const STATUS_REASON: Record<string, string> = { ready: 'ready', under_construction: 'underConstruction', new: 'new' }

const ENERGY_SCORE: Record<string, number> = { A: 100, B: 85, C: 70, D: 55, E: 40, F: 25, G: 10 }
const STATUS_SCORE: Record<string, { score: number; label: string }> = {
  ready: { score: 100, label: 'Lista para entrar — sin riesgo de plazos de entrega' },
  under_construction: { score: 65, label: 'En construcción — entrega con fecha ya comprometida' },
  new: { score: 45, label: 'Obra nueva / sobre plano — mayor plazo hasta la entrega' },
}
const AMENITY_FLAGS: { key: string; code: AmenityCode; label: string }[] = [
  { key: 'hasPool', code: 'pool', label: 'piscina' },
  { key: 'hasGarage', code: 'garage', label: 'garaje' },
  { key: 'hasTerrace', code: 'terrace', label: 'terraza' },
  { key: 'hasGarden', code: 'garden', label: 'jardín' },
  { key: 'hasElevator', code: 'elevator', label: 'ascensor' },
  { key: 'accessible', code: 'accessible', label: 'accesible' },
  { key: 'petsAllowed', code: 'pets', label: 'mascotas' },
]

export function computeSerendipiaScore(p: any, market: MarketStats): SerendipiaScore {
  const breakdown: ScoreBreakdownItem[] = []

  const pricePerM2 = p.price && p.area ? p.price / p.area : null
  if (pricePerM2 && market.avgPricePerM2) {
    const relDiff = (market.avgPricePerM2 - pricePerM2) / market.avgPricePerM2 // positive = cheaper than the zone
    const score = clamp(50 + relDiff * 150)
    breakdown.push({
      key: 'precio',
      label: 'Precio vs. zona',
      score: Math.round(score),
      detail: `${relDiff >= 0 ? '−' : '+'}${Math.abs(Math.round(relDiff * 100))}% frente a la media de ${market.comparableCount === 1 ? '1 comparable' : `${market.comparableCount} comparables`}`,
      reason: 'vsZone',
      data: { pctVsZone: noNegZero(-Math.round(relDiff * 100)), comparableCount: market.comparableCount },
    })
  }

  if (p.rentalYield) {
    const score = clamp((p.rentalYield / 8) * 100)
    breakdown.push({ key: 'rentabilidad', label: 'Rentabilidad', score: Math.round(score), detail: `${p.rentalYield}% bruta anual estimada`, reason: 'grossYield', data: { rentalYield: p.rentalYield } })
  }

  const presentFlags = AMENITY_FLAGS.filter((f) => p[f.key])
  if (AMENITY_FLAGS.some((f) => p[f.key] != null)) {
    const amenityScore = (presentFlags.length / AMENITY_FLAGS.length) * 100
    const energyScore = p.energyRating && ENERGY_SCORE[p.energyRating] != null ? ENERGY_SCORE[p.energyRating] : null
    const score = energyScore != null ? (amenityScore + energyScore) / 2 : amenityScore
    breakdown.push({
      key: 'comodidades',
      label: 'Comodidades y eficiencia',
      score: Math.round(clamp(score)),
      detail: presentFlags.length ? `${presentFlags.map((f) => f.label).join(', ')}${p.energyRating ? ` · eficiencia ${p.energyRating}` : ''}` : `Sin comodidades registradas${p.energyRating ? ` · eficiencia ${p.energyRating}` : ''}`,
      reason: presentFlags.length ? 'amenities' : 'noAmenities',
      data: { amenities: presentFlags.map((f) => f.code), energyRating: p.energyRating || null },
    })
  }

  if (p.status && STATUS_SCORE[p.status]) {
    const s = STATUS_SCORE[p.status]
    breakdown.push({ key: 'entrega', label: 'Certeza de entrega', score: s.score, detail: s.label, reason: STATUS_REASON[p.status], data: { status: p.status } })
  }

  const overall = breakdown.length ? Math.round(breakdown.reduce((a, b) => a + b.score, 0) / breakdown.length) : null
  return { overall, breakdown }
}

/**
 * "Decisión rápida" — five buyer-facing signals shown as 1-5 stars. Each is a
 * deterministic formula over real fields (never an arbitrary number): the
 * `detail` string always states the real inputs that produced the rating, so
 * a star count is never shown without its reasoning next to it. A category
 * is omitted (stars: null) when its underlying data doesn't exist yet.
 * Like the score above, each signal also carries `reason` and `data`.
 */

export interface DecisionSignal {
  key: string
  label: string
  stars: number | null
  detail: string
  reason: string
  data: ScoreTextData
}

function toStars(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)))
}

export function computeDecisionScores(p: any, market: MarketStats): DecisionSignal[] {
  const out: DecisionSignal[] = []
  const pricePerM2 = p.price && p.area ? p.price / p.area : null

  // Comprar — the overall Serendipia Score, restated as stars.
  const serendipia = computeSerendipiaScore(p, market)
  out.push(
    serendipia.overall != null
      ? { key: 'comprar', label: 'Comprar', stars: toStars(serendipia.overall), detail: `Serendipia Score global: ${serendipia.overall}/100`, reason: 'overall', data: { overall: serendipia.overall } }
      : { key: 'comprar', label: 'Comprar', stars: null, detail: 'Sin datos suficientes para valorar la compra', reason: 'noData', data: {} },
  )

  // Inversión — rentability vs. a fixed 8% "excellent yield" reference, the
  // same scale used by the Serendipia Score's own rentability sub-score.
  if (p.rentalYield) {
    const score = Math.max(0, Math.min(100, (p.rentalYield / 8) * 100))
    out.push({ key: 'inversion', label: 'Inversión', stars: toStars(score), detail: `${p.rentalYield}% de rentabilidad bruta anual estimada`, reason: 'grossYield', data: { rentalYield: p.rentalYield } })
  } else {
    out.push({ key: 'inversion', label: 'Inversión', stars: null, detail: 'Sin dato de rentabilidad para esta propiedad', reason: 'noData', data: {} })
  }

  // Revalorización — off-plan / under-construction properties have more
  // runway to appreciate before handover than a unit already delivered;
  // a rental yield above the zone average adds a real demand signal.
  const REVAL_BASE: Record<string, { score: number; label: string }> = {
    new: { score: 80, label: 'Obra nueva — mayor recorrido hasta la entrega' },
    under_construction: { score: 65, label: 'En construcción — recorrido moderado hasta la entrega' },
    ready: { score: 45, label: 'Ya entregada — recorrido de revalorización más limitado' },
  }
  if (p.status && REVAL_BASE[p.status]) {
    let score = REVAL_BASE[p.status].score
    let detail = REVAL_BASE[p.status].label
    const data: ScoreTextData = { status: p.status }
    if (p.rentalYield && market.avgRentalYield && market.comparableCount > 0) {
      const diff = p.rentalYield - market.avgRentalYield
      if (diff > 0.3) {
        score += 10
        detail += `; rentabilidad por encima de la media de la zona (+${diff.toFixed(1)} pts)`
        data.yieldVsZone = 'above'
        data.yieldDiffPts = Number(diff.toFixed(1))
      } else if (diff < -0.3) {
        score -= 10
        detail += `; rentabilidad por debajo de la media de la zona (${diff.toFixed(1)} pts)`
        data.yieldVsZone = 'below'
        data.yieldDiffPts = Number(diff.toFixed(1))
      }
    }
    out.push({ key: 'revalorizacion', label: 'Revalorización', stars: toStars(Math.max(0, Math.min(100, score))), detail, reason: STATUS_REASON[p.status], data })
  } else {
    out.push({ key: 'revalorizacion', label: 'Revalorización', stars: null, detail: 'Sin dato de estado de entrega', reason: 'noData', data: {} })
  }

  // Liquidez — a bigger comparable market and a healthier rental yield both
  // make a property easier to resell or re-let.
  if (market.comparableCount > 0 || p.rentalYield) {
    const score = Math.min(60, market.comparableCount * 15) + (p.rentalYield ? Math.min(40, (p.rentalYield / 8) * 40) : 0)
    const parts = [`${market.comparableCount === 1 ? '1 comparable activo' : `${market.comparableCount} comparables activos`} en la zona`]
    if (p.rentalYield) parts.push(`${p.rentalYield}% de rentabilidad`)
    out.push({ key: 'liquidez', label: 'Liquidez', stars: toStars(score), detail: parts.join(' · '), reason: 'market', data: { comparableCount: market.comparableCount, rentalYield: p.rentalYield || null } })
  } else {
    out.push({ key: 'liquidez', label: 'Liquidez', stars: null, detail: 'Sin comparables ni rentabilidad para valorar la liquidez', reason: 'noData', data: {} })
  }

  // Exclusividad — the catalog's own "exclusive listing" flag, adjusted by
  // how far above (or below) the zone's average price per m² this sits.
  let exclScore = p.isExclusive ? 60 : 30
  let exclDetail = p.isExclusive ? 'Listado marcado como exclusivo' : 'Listado estándar'
  const exclData: ScoreTextData = { isExclusive: !!p.isExclusive }
  if (pricePerM2 && market.avgPricePerM2) {
    const diff = (pricePerM2 - market.avgPricePerM2) / market.avgPricePerM2
    exclScore += Math.max(-20, Math.min(40, diff * 100))
    exclDetail += diff > 0.05 ? `; ${Math.round(diff * 100)}% más cara que la media de la zona` : diff < -0.05 ? `; ${Math.abs(Math.round(diff * 100))}% más económica que la media de la zona` : '; precio alineado con la zona'
    exclData.priceVsZone = diff > 0.05 ? 'above' : diff < -0.05 ? 'below' : 'aligned'
    exclData.pctVsZone = noNegZero(Math.round(diff * 100))
  }
  out.push({ key: 'exclusividad', label: 'Exclusividad', stars: toStars(Math.max(0, Math.min(100, exclScore))), detail: exclDetail, reason: p.isExclusive ? 'exclusive' : 'standard', data: exclData })

  return out
}

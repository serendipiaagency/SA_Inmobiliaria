import type { MarketStats } from './market'

/**
 * "Serendipia Score" — a transparent, reproducible index computed only from
 * real attributes already stored on the property (and real community
 * comparables). Every sub-score states the real input value it came from and
 * the formula that produced it, so nothing here is a fabricated or
 * black-box number. A sub-score is omitted (not defaulted to 0 or 50) when
 * its underlying data doesn't exist.
 */

export interface ScoreBreakdownItem {
  key: string
  label: string
  score: number
  detail: string
}

export interface SerendipiaScore {
  overall: number | null
  breakdown: ScoreBreakdownItem[]
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v))
}

const ENERGY_SCORE: Record<string, number> = { A: 100, B: 85, C: 70, D: 55, E: 40, F: 25, G: 10 }
const STATUS_SCORE: Record<string, { score: number; label: string }> = {
  ready: { score: 100, label: 'Lista para entrar — sin riesgo de plazos de entrega' },
  under_construction: { score: 65, label: 'En construcción — entrega con fecha ya comprometida' },
  new: { score: 45, label: 'Obra nueva / sobre plano — mayor plazo hasta la entrega' },
}
const AMENITY_FLAGS: { key: string; label: string }[] = [
  { key: 'hasPool', label: 'piscina' },
  { key: 'hasGarage', label: 'garaje' },
  { key: 'hasTerrace', label: 'terraza' },
  { key: 'hasGarden', label: 'jardín' },
  { key: 'hasElevator', label: 'ascensor' },
  { key: 'accessible', label: 'accesible' },
  { key: 'petsAllowed', label: 'mascotas' },
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
    })
  }

  if (p.rentalYield) {
    const score = clamp((p.rentalYield / 8) * 100)
    breakdown.push({ key: 'rentabilidad', label: 'Rentabilidad', score: Math.round(score), detail: `${p.rentalYield}% bruta anual estimada` })
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
    })
  }

  if (p.status && STATUS_SCORE[p.status]) {
    const s = STATUS_SCORE[p.status]
    breakdown.push({ key: 'entrega', label: 'Certeza de entrega', score: s.score, detail: s.label })
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
 */

export interface DecisionSignal {
  key: string
  label: string
  stars: number | null
  detail: string
}

function toStars(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)))
}

export function computeDecisionScores(p: any, market: MarketStats): DecisionSignal[] {
  const out: DecisionSignal[] = []
  const pricePerM2 = p.price && p.area ? p.price / p.area : null

  // Comprar — the overall Serendipia Score, restated as stars.
  const serendipia = computeSerendipiaScore(p, market)
  out.push({
    key: 'comprar',
    label: 'Comprar',
    stars: serendipia.overall != null ? toStars(serendipia.overall) : null,
    detail: serendipia.overall != null ? `Serendipia Score global: ${serendipia.overall}/100` : 'Sin datos suficientes para valorar la compra',
  })

  // Inversión — rentability vs. a fixed 8% "excellent yield" reference, the
  // same scale used by the Serendipia Score's own rentability sub-score.
  if (p.rentalYield) {
    const score = Math.max(0, Math.min(100, (p.rentalYield / 8) * 100))
    out.push({ key: 'inversion', label: 'Inversión', stars: toStars(score), detail: `${p.rentalYield}% de rentabilidad bruta anual estimada` })
  } else {
    out.push({ key: 'inversion', label: 'Inversión', stars: null, detail: 'Sin dato de rentabilidad para esta propiedad' })
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
    if (p.rentalYield && market.avgRentalYield && market.comparableCount > 0) {
      const diff = p.rentalYield - market.avgRentalYield
      if (diff > 0.3) {
        score += 10
        detail += `; rentabilidad por encima de la media de la zona (+${diff.toFixed(1)} pts)`
      } else if (diff < -0.3) {
        score -= 10
        detail += `; rentabilidad por debajo de la media de la zona (${diff.toFixed(1)} pts)`
      }
    }
    out.push({ key: 'revalorizacion', label: 'Revalorización', stars: toStars(Math.max(0, Math.min(100, score))), detail })
  } else {
    out.push({ key: 'revalorizacion', label: 'Revalorización', stars: null, detail: 'Sin dato de estado de entrega' })
  }

  // Liquidez — a bigger comparable market and a healthier rental yield both
  // make a property easier to resell or re-let.
  if (market.comparableCount > 0 || p.rentalYield) {
    const score = Math.min(60, market.comparableCount * 15) + (p.rentalYield ? Math.min(40, (p.rentalYield / 8) * 40) : 0)
    const parts = [`${market.comparableCount === 1 ? '1 comparable activo' : `${market.comparableCount} comparables activos`} en la zona`]
    if (p.rentalYield) parts.push(`${p.rentalYield}% de rentabilidad`)
    out.push({ key: 'liquidez', label: 'Liquidez', stars: toStars(score), detail: parts.join(' · ') })
  } else {
    out.push({ key: 'liquidez', label: 'Liquidez', stars: null, detail: 'Sin comparables ni rentabilidad para valorar la liquidez' })
  }

  // Exclusividad — the catalog's own "exclusive listing" flag, adjusted by
  // how far above (or below) the zone's average price per m² this sits.
  let exclScore = p.isExclusive ? 60 : 30
  let exclDetail = p.isExclusive ? 'Listado marcado como exclusivo' : 'Listado estándar'
  if (pricePerM2 && market.avgPricePerM2) {
    const diff = (pricePerM2 - market.avgPricePerM2) / market.avgPricePerM2
    exclScore += Math.max(-20, Math.min(40, diff * 100))
    exclDetail += diff > 0.05 ? `; ${Math.round(diff * 100)}% más cara que la media de la zona` : diff < -0.05 ? `; ${Math.abs(Math.round(diff * 100))}% más económica que la media de la zona` : '; precio alineado con la zona'
  }
  out.push({ key: 'exclusividad', label: 'Exclusividad', stars: toStars(Math.max(0, Math.min(100, exclScore))), detail: exclDetail })

  return out
}

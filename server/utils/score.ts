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

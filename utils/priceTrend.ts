/**
 * La evolución del precio de la tarjeta PRECIO de la ficha (#111): sólo con
 * cambios de precio reales (`price_history`, que guarda cada precio nuevo y
 * el que tenía antes). Sin cambios registrados, o si el precio vuelve a ser
 * el mismo, no hay tendencia que enseñar — nunca una curva inventada.
 */

export interface PriceHistoryPoint {
  price: number
  previousPrice?: number | null
  recordedAt: string
}

export interface PriceTrend {
  /** Porcentaje entero con signo, de el primer precio conocido al actual. */
  pct: number
  /** Fecha (AAAA-MM-DD…) del primer cambio registrado. */
  since: string
  /** Los precios en orden, del primero al actual, para la mini gráfica. */
  points: number[]
}

export function priceTrend(history: PriceHistoryPoint[] | null | undefined, currentPrice: number | null | undefined): PriceTrend | null {
  const rows = (history || []).filter((h) => Number(h.price) > 0 && typeof h.recordedAt === 'string').sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  const current = Number(currentPrice)
  if (!rows.length || !(current > 0)) return null
  const points: number[] = []
  if (Number(rows[0].previousPrice) > 0) points.push(Number(rows[0].previousPrice))
  for (const r of rows) if (points[points.length - 1] !== Number(r.price)) points.push(Number(r.price))
  if (points[points.length - 1] !== current) points.push(current)
  if (points.length < 2) return null
  const first = points[0]
  const pct = Math.round(((current - first) / first) * 100)
  if (pct === 0 && first === current) return null
  return { pct, since: rows[0].recordedAt, points }
}

/** La polilínea (coordenadas de un SVG de `w`×`h`) de una serie de precios. */
export function sparklinePath(points: number[], w: number, h: number, pad = 2): string {
  if (points.length < 2) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  return points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2)
      const y = pad + (1 - (p - min) / span) * (h - pad * 2)
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

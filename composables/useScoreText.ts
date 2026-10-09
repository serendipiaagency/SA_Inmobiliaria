/**
 * Los textos del Serendipia Score y de la Decisión rápida en el idioma de la
 * web. /api/public/properties/<slug>/score devuelve de cada factor su clave
 * (`key`), la del motivo (`reason`) y los datos reales de la frase (`data`),
 * además de su frase en español (`label`, `detail`, que se quedan para quien
 * ya los lee). Aquí se compone la frase con t() —con el español de siempre
 * como respaldo— y las cifras y las listas en el formato del idioma que se ve
 * (`intlLocale`). Un factor, un motivo o unos datos que esta versión no
 * reconozca enseñan la frase en español del servidor: nunca un hueco.
 */

type Translate = (key: string, fallback: string) => string

export interface ScoreTextItem {
  key: string
  label: string
  detail: string
  reason?: string
  data?: Record<string, any>
}

export interface ScoreTextOptions {
  t: Translate
  /** Formato Intl de cifras y listas: es-ES, en-GB… (useI18n().intlLocale). */
  intlLocale: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
}

function num(n: number, intlLocale: string, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2, ...opts }).format(n)
}

function amenityName(code: string, t: Translate): string | null {
  switch (code) {
    case 'pool': return t('serendipiaScore.amenity.pool', 'piscina')
    case 'garage': return t('serendipiaScore.amenity.garage', 'garaje')
    case 'terrace': return t('serendipiaScore.amenity.terrace', 'terraza')
    case 'garden': return t('serendipiaScore.amenity.garden', 'jardín')
    case 'elevator': return t('serendipiaScore.amenity.elevator', 'ascensor')
    case 'accessible': return t('serendipiaScore.amenity.accessible', 'accesible')
    case 'pets': return t('serendipiaScore.amenity.pets', 'mascotas')
    default: return null
  }
}

function factorLabel(key: string, t: Translate): string | null {
  switch (key) {
    case 'precio': return t('serendipiaScore.factor.precio.label', 'Precio vs. zona')
    case 'rentabilidad': return t('serendipiaScore.factor.rentabilidad.label', 'Rentabilidad')
    case 'comodidades': return t('serendipiaScore.factor.comodidades.label', 'Comodidades y eficiencia')
    case 'entrega': return t('serendipiaScore.factor.entrega.label', 'Certeza de entrega')
    default: return null
  }
}

function factorDetail(item: ScoreTextItem, { t, intlLocale }: ScoreTextOptions): string | null {
  const d = item.data || {}
  switch (`${item.key}.${item.reason}`) {
    case 'precio.vsZone': {
      if (!isNum(d.pctVsZone) || !isNum(d.comparableCount)) return null
      const comparables = d.comparableCount === 1 ? t('serendipiaScore.comparableOne', '{n} comparable') : t('serendipiaScore.comparableOther', '{n} comparables')
      return fill(t('serendipiaScore.factor.precio.vsZone', '{pct}% frente a la media de {comparables}'), {
        pct: num(d.pctVsZone, intlLocale, { signDisplay: 'exceptZero' }),
        comparables: fill(comparables, { n: num(d.comparableCount, intlLocale) }),
      })
    }
    case 'rentabilidad.grossYield':
      if (!isNum(d.rentalYield)) return null
      return fill(t('serendipiaScore.factor.rentabilidad.grossYield', '{yield}% bruta anual estimada'), { yield: num(d.rentalYield, intlLocale) })
    case 'comodidades.amenities':
    case 'comodidades.noAmenities': {
      const names = (Array.isArray(d.amenities) ? d.amenities : []).map((c: string) => amenityName(c, t))
      const expectsNames = item.reason === 'amenities'
      if (names.includes(null) || expectsNames !== names.length > 0) return null
      const parts = [names.length ? new Intl.ListFormat(intlLocale, { type: 'conjunction' }).format(names as string[]) : t('serendipiaScore.factor.comodidades.none', 'Sin comodidades registradas')]
      if (d.energyRating) parts.push(fill(t('serendipiaScore.factor.comodidades.energy', 'eficiencia {rating}'), { rating: String(d.energyRating) }))
      return parts.join(' · ')
    }
    case 'entrega.ready': return t('serendipiaScore.factor.entrega.ready', 'Lista para entrar — sin riesgo de plazos de entrega')
    case 'entrega.underConstruction': return t('serendipiaScore.factor.entrega.underConstruction', 'En construcción — entrega con fecha ya comprometida')
    case 'entrega.new': return t('serendipiaScore.factor.entrega.new', 'Obra nueva / sobre plano — mayor plazo hasta la entrega')
    default: return null
  }
}

function signalLabel(key: string, t: Translate): string | null {
  switch (key) {
    case 'comprar': return t('decisionPanel.decision.comprar.label', 'Comprar')
    case 'inversion': return t('decisionPanel.decision.inversion.label', 'Inversión')
    case 'revalorizacion': return t('decisionPanel.decision.revalorizacion.label', 'Revalorización')
    case 'liquidez': return t('decisionPanel.decision.liquidez.label', 'Liquidez')
    case 'exclusividad': return t('decisionPanel.decision.exclusividad.label', 'Exclusividad')
    default: return null
  }
}

function revalBase(reason: string | undefined, t: Translate): string | null {
  switch (reason) {
    case 'new': return t('decisionPanel.decision.revalorizacion.new', 'Obra nueva — mayor recorrido hasta la entrega')
    case 'underConstruction': return t('decisionPanel.decision.revalorizacion.underConstruction', 'En construcción — recorrido moderado hasta la entrega')
    case 'ready': return t('decisionPanel.decision.revalorizacion.ready', 'Ya entregada — recorrido de revalorización más limitado')
    default: return null
  }
}

function signalDetail(item: ScoreTextItem, { t, intlLocale }: ScoreTextOptions): string | null {
  const d = item.data || {}
  // «Base; matiz»: el punto y coma también es del idioma (en francés lleva espacio delante, en árabe es «؛»).
  const clauses = (...parts: string[]) => parts.join(t('decisionPanel.decision.clauseSeparator', '; '))
  switch (`${item.key}.${item.reason}`) {
    case 'comprar.overall':
      if (!isNum(d.overall)) return null
      return fill(t('decisionPanel.decision.comprar.overall', 'Serendipia Score global: {score}/100'), { score: num(d.overall, intlLocale) })
    case 'comprar.noData': return t('decisionPanel.decision.comprar.noData', 'Sin datos suficientes para valorar la compra')
    case 'inversion.grossYield':
      if (!isNum(d.rentalYield)) return null
      return fill(t('decisionPanel.decision.inversion.grossYield', '{yield}% de rentabilidad bruta anual estimada'), { yield: num(d.rentalYield, intlLocale) })
    case 'inversion.noData': return t('decisionPanel.decision.inversion.noData', 'Sin dato de rentabilidad para esta propiedad')
    case 'revalorizacion.new':
    case 'revalorizacion.underConstruction':
    case 'revalorizacion.ready': {
      const base = revalBase(item.reason, t)!
      if (!d.yieldVsZone) return base
      if (!isNum(d.yieldDiffPts)) return null
      const diff = num(d.yieldDiffPts, intlLocale, { signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1 })
      if (d.yieldVsZone === 'above') return clauses(base, fill(t('decisionPanel.decision.revalorizacion.yieldAbove', 'rentabilidad por encima de la media de la zona ({diff} pts)'), { diff }))
      if (d.yieldVsZone === 'below') return clauses(base, fill(t('decisionPanel.decision.revalorizacion.yieldBelow', 'rentabilidad por debajo de la media de la zona ({diff} pts)'), { diff }))
      return null
    }
    case 'revalorizacion.noData': return t('decisionPanel.decision.revalorizacion.noData', 'Sin dato de estado de entrega')
    case 'liquidez.market': {
      if (!isNum(d.comparableCount)) return null
      const comparables = d.comparableCount === 1 ? t('decisionPanel.decision.liquidez.comparableOne', '{n} comparable activo en la zona') : t('decisionPanel.decision.liquidez.comparableOther', '{n} comparables activos en la zona')
      const parts = [fill(comparables, { n: num(d.comparableCount, intlLocale) })]
      if (isNum(d.rentalYield) && d.rentalYield) parts.push(fill(t('decisionPanel.decision.liquidez.yield', '{yield}% de rentabilidad'), { yield: num(d.rentalYield, intlLocale) }))
      return parts.join(' · ')
    }
    case 'liquidez.noData': return t('decisionPanel.decision.liquidez.noData', 'Sin comparables ni rentabilidad para valorar la liquidez')
    case 'exclusividad.exclusive':
    case 'exclusividad.standard': {
      const base = item.reason === 'exclusive' ? t('decisionPanel.decision.exclusividad.exclusive', 'Listado marcado como exclusivo') : t('decisionPanel.decision.exclusividad.standard', 'Listado estándar')
      if (!d.priceVsZone) return base
      if (d.priceVsZone === 'aligned') return clauses(base, t('decisionPanel.decision.exclusividad.aligned', 'precio alineado con la zona'))
      if (!isNum(d.pctVsZone)) return null
      const pct = num(Math.abs(d.pctVsZone), intlLocale)
      if (d.priceVsZone === 'above') return clauses(base, fill(t('decisionPanel.decision.exclusividad.above', '{pct}% más cara que la media de la zona'), { pct }))
      if (d.priceVsZone === 'below') return clauses(base, fill(t('decisionPanel.decision.exclusividad.below', '{pct}% más económica que la media de la zona'), { pct }))
      return null
    }
    default: return null
  }
}

/** Etiqueta y explicación de un factor del Serendipia Score, en el idioma de `t`. */
export function scoreFactorText(item: ScoreTextItem, opts: ScoreTextOptions): { label: string; detail: string } {
  return { label: factorLabel(item.key, opts.t) ?? item.label, detail: factorDetail(item, opts) ?? item.detail }
}

/** Etiqueta y explicación de una valoración de la Decisión rápida, en el idioma de `t`. */
export function decisionSignalText(item: ScoreTextItem, opts: ScoreTextOptions): { label: string; detail: string } {
  return { label: signalLabel(item.key, opts.t) ?? item.label, detail: signalDetail(item, opts) ?? item.detail }
}

export function useScoreText() {
  const { t, intlLocale } = useI18n()
  return {
    factor: (item: ScoreTextItem) => scoreFactorText(item, { t, intlLocale: intlLocale.value }),
    decision: (item: ScoreTextItem) => decisionSignalText(item, { t, intlLocale: intlLocale.value }),
  }
}

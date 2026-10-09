import { describe, expect, it } from 'vitest'
import { computeDecisionScores, computeSerendipiaScore } from '../../server/utils/score'
import { decisionSignalText, scoreFactorText, type ScoreTextItem } from '../../composables/useScoreText'
import { LOCALES, messages } from '../../i18n/messages'

/**
 * El Serendipia Score y la Decisión rápida de la ficha pública en el idioma
 * de la web: el servidor (server/utils/score.ts) devuelve la clave de cada
 * factor y de su motivo con los datos de la frase, y el cliente
 * (composables/useScoreText.ts) compone la frase con t() y las cifras con el
 * formato del idioma. El español de siempre es el respaldo.
 */

const INTL: Record<string, string> = { es: 'es-ES', en: 'en-GB', de: 'de-DE', pt: 'pt-PT', fr: 'fr-FR', ar: 'ar' }
// Igual que useI18n().t: el idioma, luego el español y por último el respaldo.
const tr = (loc: string) => (k: string, fb: string) => messages[loc]?.[k] ?? messages.es[k] ?? fb
const opts = (loc: string) => ({ t: tr(loc), intlLocale: INTL[loc] })

const NO_FLAGS = { hasPool: 0, hasGarage: 0, hasTerrace: 0, hasGarden: 0, hasElevator: 0, accessible: 0, petsAllowed: 0 }
// Entre las cuatro salen todos los factores y todos los motivos que el servidor sabe decir.
const CASES = {
  // Más barata que la zona, con rentabilidad por encima de la media, obra nueva, exclusiva.
  cheap: {
    p: { ...NO_FLAGS, price: 300000, area: 100, rentalYield: 6, hasPool: 1, hasTerrace: 1, energyRating: 'B', status: 'new', isExclusive: 1 },
    m: { comparableCount: 3, avgPricePerM2: 3500, avgRentalYield: 5 },
  },
  // Más cara, rentabilidad con decimales y por debajo, en construcción, sin comodidades.
  pricey: {
    p: { ...NO_FLAGS, price: 400000, area: 100, rentalYield: 4.5, energyRating: null, status: 'under_construction', isExclusive: 0 },
    m: { comparableCount: 1, avgPricePerM2: 3500, avgRentalYield: 5 },
  },
  // Al precio de la zona, lista para entrar, sin rentabilidad ni casillas de comodidades.
  aligned: {
    p: { price: 350000, area: 100, status: 'ready', isExclusive: 0 },
    m: { comparableCount: 2, avgPricePerM2: 3500, avgRentalYield: null },
  },
  // Sin ningún dato.
  empty: {
    p: {},
    m: { comparableCount: 0, avgPricePerM2: null, avgRentalYield: null },
  },
} as const

function render(name: keyof typeof CASES, loc: string) {
  const { p, m } = CASES[name]
  const score = computeSerendipiaScore(p, m)
  const decision = computeDecisionScores(p, m)
  return {
    score,
    decision,
    factors: Object.fromEntries(score.breakdown.map((b) => [b.key, scoreFactorText(b, opts(loc))])),
    signals: Object.fromEntries(decision.map((d) => [d.key, decisionSignalText(d, opts(loc))])),
  }
}

describe('Serendipia Score y Decisión rápida: claves y datos del servidor', () => {
  it('cada factor y cada valoración trae la clave de su motivo y sus datos, y sigue trayendo su frase en español', () => {
    const { score, decision } = render('cheap', 'es')
    expect(score.breakdown.map((b) => [b.key, b.reason])).toEqual([
      ['precio', 'vsZone'],
      ['rentabilidad', 'grossYield'],
      ['comodidades', 'amenities'],
      ['entrega', 'new'],
    ])
    expect(score.breakdown[0]).toMatchObject({ label: 'Precio vs. zona', detail: '−14% frente a la media de 3 comparables', data: { pctVsZone: -14, comparableCount: 3 } })
    expect(score.breakdown[2]).toMatchObject({ detail: 'piscina, terraza · eficiencia B', data: { amenities: ['pool', 'terrace'], energyRating: 'B' } })
    expect(decision.map((d) => [d.key, d.reason])).toEqual([
      ['comprar', 'overall'],
      ['inversion', 'grossYield'],
      ['revalorizacion', 'new'],
      ['liquidez', 'market'],
      ['exclusividad', 'exclusive'],
    ])
    expect(decision[2]).toMatchObject({ label: 'Revalorización', detail: 'Obra nueva — mayor recorrido hasta la entrega; rentabilidad por encima de la media de la zona (+1.0 pts)', data: { status: 'new', yieldVsZone: 'above', yieldDiffPts: 1 } })
    expect(decision[4].data).toEqual({ isExclusive: true, priceVsZone: 'below', pctVsZone: -14 })

    const empty = render('empty', 'es')
    expect(empty.score).toEqual({ overall: null, breakdown: [] })
    expect(empty.decision.map((d) => [d.key, d.reason, d.stars])).toEqual([
      ['comprar', 'noData', null],
      ['inversion', 'noData', null],
      ['revalorizacion', 'noData', null],
      ['liquidez', 'noData', null],
      ['exclusividad', 'standard', 2],
    ])
  })

  it('el cliente reconoce todo lo que el servidor dice: ninguna frase cae al español del servidor', () => {
    for (const name of Object.keys(CASES) as (keyof typeof CASES)[]) {
      const { p, m } = CASES[name]
      const marked = (i: ScoreTextItem) => ({ ...i, label: '«servidor»', detail: '«servidor»' })
      for (const b of computeSerendipiaScore(p, m).breakdown) expect(scoreFactorText(marked(b), opts('en')), `${name} ${b.key}.${b.reason}`).not.toMatchObject({ detail: '«servidor»' })
      for (const b of computeSerendipiaScore(p, m).breakdown) expect(scoreFactorText(marked(b), opts('en')).label, `${name} ${b.key}`).not.toBe('«servidor»')
      for (const d of computeDecisionScores(p, m)) {
        const out = decisionSignalText(marked(d), opts('en'))
        expect([out.label, out.detail], `${name} ${d.key}.${d.reason}`).not.toContain('«servidor»')
      }
    }
  })
})

describe('Serendipia Score y Decisión rápida en el idioma de la web', () => {
  it('en español, las etiquetas de siempre y las frases de siempre, con las cifras en formato español', () => {
    const cheap = render('cheap', 'es')
    for (const b of cheap.score.breakdown) expect(cheap.factors[b.key].label).toBe(b.label)
    for (const d of cheap.decision) expect(cheap.signals[d.key].label).toBe(d.label)
    expect(cheap.factors.precio.detail).toBe('-14% frente a la media de 3 comparables')
    expect(cheap.factors.rentabilidad.detail).toBe('6% bruta anual estimada')
    expect(cheap.factors.comodidades.detail).toBe('piscina y terraza · eficiencia B')
    expect(cheap.factors.entrega.detail).toBe('Obra nueva / sobre plano — mayor plazo hasta la entrega')
    expect(cheap.signals.comprar.detail).toBe(`Serendipia Score global: ${cheap.score.overall}/100`)
    expect(cheap.signals.inversion.detail).toBe('6% de rentabilidad bruta anual estimada')
    expect(cheap.signals.revalorizacion.detail).toBe('Obra nueva — mayor recorrido hasta la entrega; rentabilidad por encima de la media de la zona (+1,0 pts)')
    expect(cheap.signals.liquidez.detail).toBe('3 comparables activos en la zona · 6% de rentabilidad')
    expect(cheap.signals.exclusividad.detail).toBe('Listado marcado como exclusivo; 14% más económica que la media de la zona')

    const pricey = render('pricey', 'es')
    expect(pricey.factors.precio.detail).toBe('+14% frente a la media de 1 comparable')
    expect(pricey.factors.rentabilidad.detail).toBe('4,5% bruta anual estimada')
    expect(pricey.factors.comodidades.detail).toBe('Sin comodidades registradas')
    expect(pricey.factors.entrega.detail).toBe('En construcción — entrega con fecha ya comprometida')
    expect(pricey.signals.revalorizacion.detail).toBe('En construcción — recorrido moderado hasta la entrega; rentabilidad por debajo de la media de la zona (-0,5 pts)')
    expect(pricey.signals.liquidez.detail).toBe('1 comparable activo en la zona · 4,5% de rentabilidad')
    expect(pricey.signals.exclusividad.detail).toBe('Listado estándar; 14% más cara que la media de la zona')

    const aligned = render('aligned', 'es')
    expect(aligned.factors.precio.detail).toBe('0% frente a la media de 2 comparables')
    expect(aligned.factors.entrega.detail).toBe('Lista para entrar — sin riesgo de plazos de entrega')
    expect(aligned.signals.inversion.detail).toBe('Sin dato de rentabilidad para esta propiedad')
    expect(aligned.signals.revalorizacion.detail).toBe('Ya entregada — recorrido de revalorización más limitado')
    expect(aligned.signals.liquidez.detail).toBe('2 comparables activos en la zona')
    expect(aligned.signals.exclusividad.detail).toBe('Listado estándar; precio alineado con la zona')

    const empty = render('empty', 'es')
    for (const d of empty.decision) expect(empty.signals[d.key].detail, d.key).toBe(d.detail)
  })

  it('en inglés, etiquetas y frases en inglés, sin una palabra en español', () => {
    const cheap = render('cheap', 'en')
    expect(Object.values(cheap.factors).map((f) => f.label)).toEqual(['Price vs. area', 'Rental yield', 'Amenities and efficiency', 'Handover certainty'])
    expect(Object.values(cheap.signals).map((f) => f.label)).toEqual(['Buy', 'Investment', 'Appreciation', 'Liquidity', 'Exclusivity'])
    expect(cheap.factors.precio.detail).toBe('-14% vs. the average of 3 comparable properties')
    expect(cheap.factors.comodidades.detail).toBe('pool and terrace · energy rating B')
    expect(cheap.signals.comprar.detail).toBe(`Overall Serendipia Score: ${cheap.score.overall}/100`)
    expect(cheap.signals.revalorizacion.detail).toBe('New build — more room to grow before handover; yield above the area average (+1.0 pts)')
    const pricey = render('pricey', 'en')
    expect(pricey.factors.rentabilidad.detail).toBe('4.5% estimated gross annual yield')
    expect(pricey.signals.liquidez.detail).toBe('1 active comparable property in the area · 4.5% yield')

    for (const name of Object.keys(CASES) as (keyof typeof CASES)[]) {
      const en = render(name, 'en')
      const es = render(name, 'es')
      const texts = [...Object.values(en.factors), ...Object.values(en.signals)].flatMap((x) => [x.label, x.detail])
      const spanish = [...Object.values(es.factors), ...Object.values(es.signals)].flatMap((x) => [x.label, x.detail])
      for (const s of texts) {
        expect(spanish, `${name}: «${s}» es la frase en español`).not.toContain(s)
        expect(s, name).not.toMatch(/[áéíóúñ¿¡]/i)
      }
    }
  })

  it('las cifras y las listas van en el formato de cada idioma', () => {
    expect(render('pricey', 'de').factors.rentabilidad.detail).toBe('4,5 % geschätzte jährliche Bruttorendite')
    expect(render('pricey', 'fr').signals.revalorizacion.detail).toBe('En construction — marge modérée jusqu’à la livraison ; rendement inférieur à la moyenne du quartier (-0,5 pts)')
    expect(render('pricey', 'pt').factors.precio.detail).toBe('+14% face à média de 1 imóvel comparável')
    expect(render('cheap', 'de').factors.comodidades.detail).toBe('Pool und Terrasse · Energieeffizienz B')
    expect(render('cheap', 'ar').signals.exclusividad.detail).toContain('؛ ')
  })

  it('cada clave que se pide existe en los seis idiomas', () => {
    for (const { code } of LOCALES) {
      const asked = new Set<string>()
      const spy = (k: string, fb: string) => {
        asked.add(k)
        return tr(code)(k, fb)
      }
      for (const name of Object.keys(CASES) as (keyof typeof CASES)[]) {
        const { p, m } = CASES[name]
        for (const b of computeSerendipiaScore(p, m).breakdown) scoreFactorText(b, { t: spy, intlLocale: INTL[code] })
        for (const d of computeDecisionScores(p, m)) decisionSignalText(d, { t: spy, intlLocale: INTL[code] })
      }
      expect(asked.size).toBeGreaterThan(30)
      expect([...asked].filter((k) => !messages[code]?.[k]), code).toEqual([])
    }
  })

  it('lo que esta versión no reconoce enseña la frase en español del servidor, nunca un hueco', () => {
    const o = opts('en')
    expect(scoreFactorText({ key: 'nuevo', label: 'Nuevo factor', detail: 'Explicación' }, o)).toEqual({ label: 'Nuevo factor', detail: 'Explicación' })
    // Factor conocido con un motivo nuevo: la etiqueta traducida, la explicación del servidor.
    expect(scoreFactorText({ key: 'entrega', label: 'Certeza de entrega', detail: 'Entregada hace un año', reason: 'delivered', data: {} }, o)).toEqual({ label: 'Handover certainty', detail: 'Entregada hace un año' })
    // Sin los datos de la frase (una respuesta antigua): la explicación del servidor.
    expect(scoreFactorText({ key: 'rentabilidad', label: 'Rentabilidad', detail: '6% bruta anual estimada' }, o).detail).toBe('6% bruta anual estimada')
    expect(scoreFactorText({ key: 'comodidades', label: 'x', detail: 'piscina, sauna', reason: 'amenities', data: { amenities: ['pool', 'sauna'] } }, o).detail).toBe('piscina, sauna')
    expect(decisionSignalText({ key: 'comprar', label: 'Comprar', detail: 'Serendipia Score global: 70/100', reason: 'overall', data: {} }, o)).toEqual({ label: 'Buy', detail: 'Serendipia Score global: 70/100' })
  })
})

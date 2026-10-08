/**
 * Calculadora de la ficha (#110): cuánto dinero hace falta para comprar
 * (entrada + impuestos + gastos) y cuánto se pagaría al mes. Pura y sin
 * Vue, la usan la sección «Hipoteca y costes» y el «Coste mensual» del panel.
 *
 * Los impuestos y gastos de compra dependen del país y, en España, de la
 * comunidad autónoma: no hay un tipo universal. Por eso los supuestos salen
 * del mercado de la agencia (su moneda), se dicen en la propia calculadora y
 * el visitante los puede cambiar. Es una estimación, nunca una oferta.
 */

export type MortgageMarket = 'es' | 'ae' | 'generic'

export interface PurchaseAssumptions {
  market: MortgageMarket
  /** Impuestos de la compra, en % del precio. */
  taxPct: number
  /** Cómo se llaman esos impuestos en ese mercado. */
  taxLabel: string
  /** Notaría, registro, gestoría y tasas, en % del precio. */
  feesPct: number
  /** Gastos de importe fijo (en la moneda de la agencia), además del %. */
  feesFixed: number
  feesLabel: string
  /** Lo que se ha supuesto, en una frase, para enseñarlo. */
  note: string
}

/**
 * Supuestos por mercado. España (EUR): la compra a promotor (obra nueva)
 * lleva IVA del 10 % —tipo general de vivienda; Canarias aplica IGIC— y AJD,
 * que fija cada comunidad (entre 0,5 % y 1,5 %): se toma 1,5 %, el más
 * habitual, y se avisa. Notaría, registro y gestoría rondan el 1 %. Dubái
 * (AED): tasa del DLD del 4 % y las tasas fijas de registro. Otra moneda: sin
 * impuestos supuestos — el visitante escribe los de su zona.
 */
export function purchaseAssumptions(currency: string, offPlan: boolean): PurchaseAssumptions {
  const c = String(currency || '').toUpperCase()
  if (c === 'EUR') {
    return {
      market: 'es',
      taxPct: 11.5,
      taxLabel: 'IVA (10 %) + AJD',
      feesPct: 1,
      feesFixed: 0,
      feesLabel: 'Notaría, registro y gestoría',
      note: 'Vivienda nueva en España: IVA del 10 % (IGIC en Canarias) y AJD estimado en el 1,5 % (cada comunidad fija el suyo, entre el 0,5 % y el 1,5 %). Notaría, registro y gestoría, alrededor del 1 %.',
    }
  }
  if (c === 'AED') {
    return {
      market: 'ae',
      taxPct: 4,
      taxLabel: 'Tasa de transferencia (DLD)',
      feesPct: 0,
      feesFixed: offPlan ? 3000 + 4500 : 4200 + 580,
      feesLabel: offPlan ? 'Registro Oqood y fideicomiso' : 'Registro DLD y title deed',
      note: 'Dubái: tasa del Dubai Land Department del 4 % y tasas de registro fijas. No hay impuesto anual sobre la propiedad.',
    }
  }
  return {
    market: 'generic',
    taxPct: 0,
    taxLabel: 'Impuestos de la compra',
    feesPct: 0,
    feesFixed: 0,
    feesLabel: 'Notaría, registro y otros gastos',
    note: 'Escribe los impuestos y gastos de compra de tu zona para incluirlos en el cálculo.',
  }
}

export interface MortgageInput {
  price: number
  /** Entrada, % del precio (0-100). */
  downPct: number
  /** Interés nominal anual, %. */
  ratePct: number
  years: number
  taxPct: number
  feesPct: number
  feesFixed?: number
}

export interface MortgageResult {
  price: number
  downPayment: number
  taxes: number
  fees: number
  /** Lo que hay que tener ahorrado: entrada + impuestos + gastos. */
  cashNeeded: number
  loan: number
  monthly: number
  totalInterest: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

/** Cuota francesa: cuota = P·r / (1 − (1 + r)^−n), con r mensual. Sin interés, P / n. */
export function monthlyPayment(loan: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12)
  if (loan <= 0 || n <= 0) return 0
  const r = ratePct / 100 / 12
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n))
}

export function computeMortgage(input: MortgageInput): MortgageResult {
  const price = Math.max(0, Number(input.price) || 0)
  const downPct = clamp(input.downPct, 0, 100)
  const years = clamp(input.years, 1, 40)
  const ratePct = clamp(input.ratePct, 0, 20)
  const downPayment = Math.round((price * downPct) / 100)
  const taxes = Math.round((price * clamp(input.taxPct, 0, 50)) / 100)
  const fees = Math.round((price * clamp(input.feesPct, 0, 20)) / 100 + Math.max(0, Number(input.feesFixed) || 0))
  const loan = price - downPayment
  const monthly = Math.round(monthlyPayment(loan, ratePct, years))
  return {
    price,
    downPayment,
    taxes,
    fees,
    cashNeeded: downPayment + taxes + fees,
    loan,
    monthly,
    totalInterest: Math.max(0, Math.round(monthlyPayment(loan, ratePct, years) * years * 12 - loan)),
  }
}

/** Valores de partida de la calculadora: 20 % de entrada, 25 años y un interés de referencia (editables). */
export const MORTGAGE_DEFAULTS = { downPct: 20, ratePct: 3.5, years: 25 } as const

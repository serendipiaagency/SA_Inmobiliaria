/**
 * Moneda de la agencia (núcleo inmobiliario, FASE 5) — la regla ÚNICA,
 * compartida por el panel, la web pública y el servidor (IA, emails, PDFs).
 *
 *  1. **La fuente de verdad es el ajuste `currency` de la agencia**
 *     (Sistema → Configuración → Moneda). Los importes sin moneda propia
 *     (precio de las propiedades, presupuesto del lead, precios de una
 *     necesidad, operaciones cerradas, reservas, facturas…) se guardan en esa
 *     moneda: nunca se convierten al guardar ni al leer.
 *  2. **Panel y servidor** formatean esos importes con la moneda de la
 *     agencia, sin convertir (`formatMoney`).
 *  3. **Web pública**: la moneda base es la de la agencia (la expone
 *     `/api/public/tenant`). El selector de moneda del visitante sólo cambia
 *     cómo se ENSEÑA: convierte desde esa base con tasas orientativas
 *     relativas (`convertAmount`). Los filtros de precio siguen enviando
 *     importes en la moneda base, que es en la que filtra el servidor.
 *  4. **Registros con moneda propia** (ofertas, operaciones del pipeline,
 *     depósitos de Stripe) se enseñan con SU moneda (`formatAmount` de
 *     `utils/pipelineCatalog.ts`), no con la de la agencia.
 *  5. **Agencia sin ajuste**: `DEFAULT_AGENCY_CURRENCY` (AED), que es lo que
 *     ya enseñaban Configuración, la web pública y el panel por defecto —
 *     igual que `DEFAULT_AGENCY_TIMEZONE` es Asia/Dubái. No se cambia ningún
 *     dato: una agencia que trabaja en euros elige EUR en Configuración.
 *
 * Sin dependencias de Nuxt ni del navegador: lo importan los composables,
 * los componentes y `server/utils` (con ruta relativa) por igual.
 */

export interface CurrencyInfo {
  code: string
  /** Símbolo corto para rótulos como «Presupuesto (€)». */
  symbol: string
  /** Locale con el que la web pública pinta la moneda («AED 1,250,000», «1.250.000 €», «$1,250,000»). */
  locale: string
  /**
   * Unidades de esta moneda por 1 USD: tasas orientativas y fijas, RELATIVAS
   * entre sí (no «desde AED»). Convertir de A a B es `importe × perUsd[B] /
   * perUsd[A]`, sea cual sea la moneda base de la agencia. Son las mismas
   * tasas cruzadas que había antes (1 AED = 0,2532 € = 0,2723 $…), así que
   * el visitante de una agencia en AED ve los mismos importes que antes.
   */
  perUsd: number
  /** Nombre para el selector de Configuración. */
  label: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'AED', symbol: 'AED', locale: 'en-AE', perUsd: 3.6725, label: 'Dírham (AED)' },
  { code: 'EUR', symbol: '€', locale: 'es-ES', perUsd: 0.9299, label: 'Euro (€)' },
  { code: 'USD', symbol: '$', locale: 'en-US', perUsd: 1, label: 'Dólar estadounidense ($)' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', perUsd: 0.79, label: 'Libra esterlina (£)' },
  { code: 'CNY', symbol: '¥', locale: 'zh-CN', perUsd: 7.205, label: 'Yuan (¥)' },
]

/** La moneda de una agencia que nunca la ha elegido en Configuración. */
export const DEFAULT_AGENCY_CURRENCY = 'AED'

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

/** Código ISO en mayúsculas si es una moneda que la plataforma conoce («eur» → «EUR»); null si no. */
export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return BY_CODE.has(code) ? code : null
}

/** La moneda de la agencia a partir del valor guardado: si falta o no es válida, la de por defecto. */
export function agencyCurrencyOrDefault(value: unknown): string {
  return normalizeCurrency(value) || DEFAULT_AGENCY_CURRENCY
}

export function currencyInfo(code: unknown): CurrencyInfo {
  return BY_CODE.get(agencyCurrencyOrDefault(code))!
}

/** Rótulo corto para etiquetas de formulario: «€», «AED», «$». */
export function currencySymbol(code: unknown): string {
  return currencyInfo(code).symbol
}

/**
 * Convierte un importe entre dos monedas con las tasas orientativas
 * relativas. Misma moneda → el mismo importe (nunca se redondea de más).
 */
export function convertAmount(amount: number, from: unknown, to: unknown): number {
  const a = currencyInfo(from)
  const b = currencyInfo(to)
  if (a.code === b.code) return amount
  return (amount * b.perUsd) / a.perUsd
}

function compactNumber(v: number, decimalSeparator: string): string {
  const abs = Math.abs(v)
  if (abs >= 1e6) {
    const m = v / 1e6
    return `${(Math.round(m * 10) / 10).toString().replace('.', decimalSeparator)}M`
  }
  if (abs >= 1e3) return `${Math.round(v / 1e3)}k`
  return String(Math.round(v))
}

/**
 * Intl separa importe y moneda con un espacio duro (U+00A0 / U+202F). Se
 * cambia por un espacio normal: es lo que escribía el código de antes («450.000
 * €»), lo que esperan los textos de WhatsApp y email, y lo que se busca en la
 * pantalla.
 */
function plainSpaces(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, ' ')
}

export interface FormatMoneyOptions {
  /** «1,2 M €» / «312 mil AED» en vez del importe completo (tarjetas, gráficos). */
  compact?: boolean
  /** Texto para un importe vacío (por defecto «—»). */
  empty?: string
}

/**
 * Formato del PANEL y del SERVIDOR (emails, IA, PDFs, WhatsApp): castellano
 * (es-ES), sin decimales y con la moneda indicada, SIN convertir
 * («1.250.000 €», «1.250.000 AED», «1.250.000 US$»).
 */
export function formatMoney(amount: number | null | undefined, currency: unknown, opts: FormatMoneyOptions = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return opts.empty ?? '—'
  const code = agencyCurrencyOrDefault(currency)
  const n = Number(amount)
  if (opts.compact && Math.abs(n) >= 1e3) {
    const value = plainSpaces(Math.abs(n) >= 1e6 ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n / 1e6)} M` : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n / 1e3))} mil`)
    return `${value} ${currencySymbol(code)}`
  }
  return plainSpaces(new Intl.NumberFormat('es-ES', { style: 'currency', currency: code, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(n)))
}

/**
 * Formato de la WEB PÚBLICA: convierte de la moneda base de la agencia a la
 * que eligió el visitante y la pinta con el locale de esa moneda
 * («AED 1,250,000», «1.250.000 €», «$1,250,000»). Es el mismo aspecto que
 * tenía `useCurrency()` para AED, USD, GBP y CNY; el euro pasa a escribirse
 * como en España (antes «€1.250.000»).
 */
export function formatDisplayPrice(amount: number | null | undefined, base: unknown, display: unknown, opts: FormatMoneyOptions = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return opts.empty ?? '—'
  const c = currencyInfo(display)
  const value = convertAmount(Number(amount), base, c.code)
  if (opts.compact) {
    const decimal = c.code === 'EUR' ? ',' : '.'
    const num = compactNumber(value, decimal)
    if (c.code === 'EUR') return `${num} €`
    return c.code === 'AED' ? `AED ${num}` : `${c.symbol}${num}`
  }
  return plainSpaces(new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(value)))
}

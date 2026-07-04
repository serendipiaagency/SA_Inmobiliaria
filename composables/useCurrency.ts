/**
 * Currency switcher. Prices in the DB are stored in AED (the native market
 * currency). We convert on the fly to the selected display currency using
 * indicative fixed rates (AED → currency multiplier). Selection persists in a
 * cookie so it survives navigation and SSR.
 */
export interface Currency {
  code: string
  symbol: string
  rate: number // multiply an AED amount by this to get the target currency
  locale: string
}

export const CURRENCIES: Currency[] = [
  { code: 'AED', symbol: 'AED', rate: 1, locale: 'en-AE' },
  { code: 'USD', symbol: '$', rate: 0.2723, locale: 'en-US' },
  { code: 'EUR', symbol: '€', rate: 0.2532, locale: 'de-DE' },
  { code: 'GBP', symbol: '£', rate: 0.2151, locale: 'en-GB' },
  { code: 'CNY', symbol: '¥', rate: 1.962, locale: 'zh-CN' },
]

export function useCurrency() {
  const cookie = useCookie<string>('currency', {
    default: () => 'AED',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  const code = useState<string>('currency-code', () => cookie.value || 'AED')

  const current = computed<Currency>(() => CURRENCIES.find((c) => c.code === code.value) || CURRENCIES[0])

  function setCurrency(next: string) {
    if (!CURRENCIES.some((c) => c.code === next)) return
    code.value = next
    cookie.value = next
  }

  /** Convert an AED value and format it in the active currency. */
  function format(aed: number | null | undefined): string {
    if (aed === null || aed === undefined) return '—'
    const c = current.value
    const value = aed * c.rate
    const formatted = new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(Math.round(value))
    // Symbol-currency codes (AED) read better after a space and before the number
    return c.code === 'AED' ? `AED ${formatted}` : `${c.symbol}${formatted}`
  }

  /** Compact form for maps/badges, e.g. "€312k" / "AED 1.2M". */
  function compact(aed: number | null | undefined): string {
    if (aed === null || aed === undefined) return '—'
    const c = current.value
    const v = aed * c.rate
    const pre = c.code === 'AED' ? 'AED ' : c.symbol
    if (Math.abs(v) >= 1e6) return `${pre}${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`
    if (Math.abs(v) >= 1e3) return `${pre}${Math.round(v / 1e3)}k`
    return `${pre}${Math.round(v)}`
  }

  return { code, current, currencies: CURRENCIES, setCurrency, format, compact }
}

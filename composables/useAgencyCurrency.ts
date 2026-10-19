import { agencyCurrencyOrDefault, currencySymbol, formatMoney, normalizeIsoCurrency, type FormatMoneyOptions } from '~/utils/currency'

/**
 * La moneda de la agencia en el PANEL (regla completa en `utils/currency.ts`):
 * todos los importes sin moneda propia se formatean con ella y sin convertir,
 * porque se guardan en esa moneda.
 *
 * La pone `layouts/admin.vue` con lo que devuelve `/api/admin/active-org-info`
 * (accesible a cualquier cuenta del panel, a diferencia de Configuración, que
 * es del área Sistema), antes de pintar la página. Fuera del panel, o antes de
 * saberla, vale la de por defecto.
 */
export function useAgencyCurrency() {
  const state = useState<string | null>('agency-currency', () => null)
  const recordState = useState<string | null>('agency-record-currency', () => null)
  const code = computed(() => agencyCurrencyOrDefault(state.value))
  /**
   * Moneda por defecto de un registro NUEVO con moneda propia (oferta,
   * depósito), en minúsculas: la elegida en Configuración o `eur` si la
   * agencia nunca eligió — ver `defaultRecordCurrency()` en el servidor.
   */
  const recordCode = computed(() => recordState.value || 'eur')
  /** Para rótulos: «Presupuesto (€)», «Importe (AED)». */
  const symbol = computed(() => currencySymbol(code.value))

  /** Con `currency` (la de la propiedad, ISO 4217) se enseña en ella, sin convertir; sin ella, la de la agencia. */
  function format(amount: number | null | undefined, opts: FormatMoneyOptions & { currency?: unknown } = {}): string {
    const { currency, ...rest } = opts
    return formatMoney(amount, normalizeIsoCurrency(currency) || code.value, rest)
  }

  function set(next: string | null | undefined, record?: string | null) {
    state.value = next ? agencyCurrencyOrDefault(next) : null
    recordState.value = record ? String(record).toLowerCase() : null
  }

  return { code, symbol, recordCode, format, set }
}

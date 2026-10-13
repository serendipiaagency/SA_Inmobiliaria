import { CURRENCIES, DEFAULT_AGENCY_CURRENCY, currencyInfo, formatDisplayPrice, normalizeCurrency, type CurrencyInfo } from '~/utils/currency'
import { isRentTransaction } from '~/utils/propertySheet'

/**
 * Selector de moneda de la WEB PÚBLICA (regla completa en `utils/currency.ts`).
 *
 * - La moneda BASE es la de la agencia, la que expone `/api/public/tenant`
 *   (Sistema → Configuración → Moneda; AED si nunca se eligió). Los importes
 *   de la base de datos están en esa moneda.
 * - El visitante puede elegir otra: sólo cambia cómo se enseña, convirtiendo
 *   desde la base con tasas orientativas relativas. Sin elección, se enseña
 *   la base tal cual.
 * - Dentro del panel (Constructor Web, inspectores, editor de propiedades) la
 *   base es la moneda de la agencia de la sesión (`agency-currency`, que pone
 *   `layouts/admin.vue`) y nunca se convierte: el panel no tiene visitante.
 *
 * La elección del visitante vive en la cookie `display_currency`. La de antes
 * (`currency`) se escribía siempre con «AED» por defecto, así que no dice
 * nada de lo que eligió nadie y se deja de leer.
 */
export function useCurrency() {
  const cookie = useCookie<string | null>('display_currency', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  const chosen = useState<string | null>('currency-code', () => normalizeCurrency(cookie.value))
  const agencyCurrency = useState<string | null>('agency-currency', () => null)
  const { tenant } = useTenant()
  const route = useRoute()
  const { t } = useI18n()

  const inAdmin = computed(() => !!agencyCurrency.value && route.path.startsWith('/admin'))
  /** Moneda en la que están guardados los importes que se pintan. */
  const base = computed(() => (inAdmin.value ? normalizeCurrency(agencyCurrency.value) : normalizeCurrency(tenant.value?.currency)) || DEFAULT_AGENCY_CURRENCY)
  /** Moneda en la que se enseñan. */
  const code = computed(() => (inAdmin.value ? base.value : chosen.value || base.value))
  const current = computed<CurrencyInfo>(() => currencyInfo(code.value))

  function setCurrency(next: string) {
    const c = normalizeCurrency(next)
    if (!c) return
    chosen.value = c
    cookie.value = c
  }

  /**
   * Importe de la base, convertido y formateado en la moneda que se enseña.
   * Con la operación de la propiedad, una renta («rent») lleva su «/mes» en
   * el idioma del visitante (`utils/propertySheet.ts`: el precio de un
   * alquiler ES la renta mensual).
   */
  function format(amount: number | null | undefined, transactionType?: unknown): string {
    const out = formatDisplayPrice(amount, base.value, code.value)
    return isRentTransaction(transactionType) ? `${out}${t('price.perMonth', '/mes')}` : out
  }

  /** Lo que va detrás del precio por m²: « / m²» o, en alquiler, « / m² al mes». */
  function perM2Suffix(transactionType?: unknown): string {
    return isRentTransaction(transactionType) ? t('price.perM2Month', ' / m² al mes') : ' / m²'
  }

  /** Forma compacta para mapas e insignias: «AED 1.2M», «312k €», «$1.4M». */
  function compact(amount: number | null | undefined): string {
    return formatDisplayPrice(amount, base.value, code.value, { compact: true })
  }

  return { code, base, current, currencies: CURRENCIES, setCurrency, format, perM2Suffix, compact }
}

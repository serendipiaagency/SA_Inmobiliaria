import { LOCALES, messages } from '~/i18n/messages'

/**
 * Lightweight i18n. Locale persists in a cookie (SSR-safe). `t(key)` resolves
 * against the active locale, falling back to Spanish and then the raw key.
 * Arabic switches the document to RTL (handled by the i18n plugin).
 */
export function useI18n() {
  const cookie = useCookie<string>('locale', {
    default: () => 'es',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  const locale = useState<string>('locale', () => cookie.value || 'es')

  const currentLocale = computed(() => LOCALES.find((l) => l.code === locale.value) || LOCALES[0])
  const isRtl = computed(() => currentLocale.value.dir === 'rtl')

  function t(key: string, fallback?: string): string {
    const dict = messages[locale.value] || messages.es
    return dict[key] ?? messages.es[key] ?? fallback ?? key
  }

  function setLocale(next: string) {
    if (!LOCALES.some((l) => l.code === next)) return
    locale.value = next
    cookie.value = next
  }

  return { locale, locales: LOCALES, currentLocale, isRtl, t, setLocale }
}

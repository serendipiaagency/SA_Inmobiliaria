/**
 * Formatting helpers shared across the SaaS dashboard. Los importes salen en
 * la moneda de la agencia (Configuración → Moneda), sin convertir — ver
 * `utils/currency.ts` y `useAgencyCurrency()`. Antes era «AED» fijo.
 */
export function useDash() {
  const nf = new Intl.NumberFormat('en-US')
  const agencyCurrency = useAgencyCurrency()

  function num(v: number | null | undefined): string {
    return nf.format(Math.round(v || 0))
  }

  function money(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
    return agencyCurrency.format(v || 0, opts)
  }

  function pct(v: number | null | undefined): string {
    const n = v || 0
    return `${n > 0 ? '+' : ''}${n}%`
  }

  function date(s: string | null | undefined, withYear = true): string {
    if (!s) return '—'
    const d = new Date(s.replace(' ', 'T'))
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  }

  function dateTime(s: string | null | undefined): string {
    if (!s) return '—'
    const d = new Date(s.replace(' ', 'T'))
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function relative(s: string | null | undefined): string {
    if (!s) return '—'
    const d = new Date(s.replace(' ', 'T'))
    if (isNaN(d.getTime())) return '—'
    const diff = Date.now() - d.getTime()
    const day = 86400000
    if (diff < 0) {
      const days = Math.round(-diff / day)
      if (days === 0) return 'hoy'
      if (days === 1) return 'mañana'
      return `en ${days} d`
    }
    const mins = Math.round(diff / 60000)
    if (mins < 60) return `hace ${Math.max(1, mins)} min`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `hace ${hrs} h`
    const days = Math.round(hrs / 24)
    if (days < 30) return `hace ${days} d`
    const months = Math.round(days / 30)
    return `hace ${months} mes${months > 1 ? 'es' : ''}`
  }

  function initials(name: string | null | undefined): string {
    if (!name) return '?'
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('')
  }

  return { num, money, pct, date, dateTime, relative, initials }
}

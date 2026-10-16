/**
 * «Exposición solar» de la ficha: el contrato de datos y las reglas puras
 * (sin Vue ni servidor) que comparten la ficha pública, el Constructor Web y
 * server/utils/solar/.
 *
 * Aquí NO se calcula ninguna exposición solar: la puntuación (SunScore) la da
 * un proveedor externo con licencia. Este módulo sólo valida lo que devuelve,
 * lo normaliza y lo explica con palabras; un dato que no cumple el contrato
 * se descarta y la sección no sale. Ninguna cifra de ejemplo se da por real:
 * la de demostración lleva `demo: true` y sólo la sirve el Constructor Web.
 */

export interface SolarExposure {
  /** 0–100 (el SunScore del proveedor), entero. */
  score: number
  /** Horas de sol directo al día de cada mes (enero…diciembre), si el proveedor las da. */
  monthlyHours: number[] | null
  confidence: 'high' | 'medium' | 'low' | null
  /** Visor 3D del proveedor: sólo https y sólo de los dominios del proveedor. Nunca se incrusta. */
  viewerUrl: string | null
  /** Quién da el dato, tal como debe figurar («Shadowmap»). */
  provider: string
  /** Fecha del cálculo (ISO), para mostrar de cuándo es. */
  fetchedAt: string | null
  /** Datos de demostración del Constructor Web: la web pública nunca los recibe. */
  demo?: boolean
}

/** Dominios desde los que se acepta un visor externo. */
export const SOLAR_VIEWER_HOSTS = ['shadowmap.org'] as const

export function isAllowedViewerUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && SOLAR_VIEWER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Lo que devuelve un proveedor, validado. Cualquier valor fuera de rango (una
 * puntuación que no está entre 0 y 100, horas negativas o de más de 24) hace
 * que el dato entero se descarte: mejor no enseñar nada que enseñar algo falso.
 */
export function normalizeSolarExposure(raw: unknown, provider: string): SolarExposure | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const score = Number(r.score)
  if (r.score === null || r.score === undefined || r.score === '' || !Number.isFinite(score) || score < 0 || score > 100) return null
  let monthlyHours: number[] | null = null
  if (r.monthlyHours !== undefined && r.monthlyHours !== null) {
    if (!Array.isArray(r.monthlyHours) || r.monthlyHours.length !== 12) return null
    const hours = r.monthlyHours.map((h) => Number(h))
    if (hours.some((h) => !Number.isFinite(h) || h < 0 || h > 24)) return null
    monthlyHours = hours.map(round1)
  }
  const confidence = r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : null
  const fetchedAt = typeof r.fetchedAt === 'string' && !Number.isNaN(Date.parse(r.fetchedAt)) ? r.fetchedAt : null
  return {
    score: Math.round(score),
    monthlyHours,
    confidence,
    viewerUrl: isAllowedViewerUrl(r.viewerUrl) ? r.viewerUrl : null,
    provider: provider.slice(0, 60),
    fetchedAt,
    ...(r.demo === true ? { demo: true } : {}),
  }
}

/** La valoración con palabras de una puntuación. Es de INMO (cinco tramos fijos), no del proveedor. */
export const SOLAR_BANDS: { min: number; label: string; text: string }[] = [
  { min: 85, label: 'Exposición solar excelente', text: 'Recibe luz directa durante casi todo el año.' },
  { min: 65, label: 'Exposición solar alta', text: 'Recibe luz directa durante buena parte del año.' },
  { min: 45, label: 'Exposición solar media', text: 'Recibe luz directa, con épocas del año más sombrías.' },
  { min: 25, label: 'Exposición solar baja', text: 'Recibe poca luz directa a lo largo del año.' },
  { min: 0, label: 'Exposición solar muy baja', text: 'Recibe muy poca luz directa a lo largo del año.' },
]

export function solarBand(score: number) {
  return SOLAR_BANDS.find((b) => score >= b.min) || SOLAR_BANDS[SOLAR_BANDS.length - 1]!
}

/** Horas de sol directo al día en junio y en diciembre, o null si no constan los doce meses. */
export function solarJuneDecember(e: SolarExposure): { june: number; december: number } | null {
  if (!e.monthlyHours || e.monthlyHours.length !== 12) return null
  return { june: e.monthlyHours[5]!, december: e.monthlyHours[11]! }
}

/** Una frase que sólo dice lo que dicen los datos; sin suponer causas. */
export function solarExplanation(e: SolarExposure): string | null {
  const jd = solarJuneDecember(e)
  if (!jd) return null
  const f = (n: number) => String(n).replace('.', ',')
  const diff = round1(jd.june - jd.december)
  if (diff <= 0.5) return `Recibe unas ${f(jd.june)} h de sol directo al día en junio y ${f(jd.december)} h en diciembre: se mantiene estable durante el año.`
  return `Recibe unas ${f(jd.june)} h de sol directo al día en junio y ${f(jd.december)} h en diciembre (${f(diff)} h menos): en invierno hay más sombra.`
}

/**
 * Los datos de demostración del Constructor Web, para ver cómo queda la
 * tarjeta. Van siempre marcados `demo` y la ficha pública no los recibe: no
 * son la exposición solar de ninguna propiedad.
 */
export const SOLAR_DEMO_EXPOSURE: SolarExposure = {
  score: 80,
  monthlyHours: [4.8, 6, 8, 9.6, 10.6, 11.2, 11, 10, 8.4, 6.6, 5.2, 4.4],
  confidence: null,
  viewerUrl: null,
  provider: 'Datos de demostración',
  fetchedAt: null,
  demo: true,
}

/**
 * Cómo está el acceso al proveedor, para el Constructor. La API de Shadowmap
 * («Sunscore for any building») sólo se da, por ahora, a socios en alta
 * temprana y no publica sus endpoints ni su autenticación: sin acceso
 * concedido no se llama a nada ni se enseña ninguna cifra.
 */
export const SOLAR_PROVIDER_STATUS = {
  key: 'shadowmap',
  name: 'Shadowmap',
  state: 'pending_access' as 'pending_access' | 'ready',
  message: 'Configuración pendiente: la API de Shadowmap (Sunscore) se concede a socios en alta temprana y no publica sus endpoints. Sin licencia y credenciales no se calcula ni se enseña ninguna exposición solar real.',
}

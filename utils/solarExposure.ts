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
  /** Estimación propia por orientación y latitud (no de un proveedor; cielo despejado, sin sombras de edificios). */
  estimated?: boolean
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
    ...(r.estimated === true ? { estimated: true } : {}),
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

/**
 * Estimación de la exposición solar de una propiedad a partir de SU ORIENTACIÓN
 * y SU LATITUD, con geometría solar real (las mismas fórmulas NOAA que
 * `composables/useSunPosition.ts`): NADA inventado y ningún proveedor externo.
 *
 * Es una estimación teórica de cielo despejado: cuenta las horas en que el sol
 * está sobre el horizonte y da sobre la fachada de esa orientación (±90º de su
 * normal), para un día representativo de cada mes. NO tiene en cuenta las
 * sombras de edificios o del relieve cercanos —eso lo dará Shadowmap cuando
 * haya licencia—, así que se marca `estimated: true` y la ficha lo dice.
 *
 * El SunScore (0–100) es la fracción de horas de luz del año en que la fachada
 * recibe sol directo: una fachada sur en el hemisferio norte se acerca a 100 y
 * una norte queda baja. Es un cociente real, no una cifra arbitraria.
 */
export const ORIENTATION_AZIMUTH: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function solarDeclination(dayOfYear: number): number {
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1)
  return (
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  )
}

/** Horas de luz y horas de sol directo sobre la fachada, para un día (paso de 5 min). */
function facadeDayHours(latDeg: number, decl: number, facadeAz: number): { daylight: number; facade: number } {
  const rad = Math.PI / 180
  const lat = latDeg * rad
  const stepDeg = 1.25 // 5 minutos de ángulo horario
  const stepHours = stepDeg / 15
  let daylight = 0
  let facade = 0
  for (let H = -180; H < 180; H += stepDeg) {
    const Hr = H * rad
    const sinElev = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(Hr)
    const elev = Math.asin(Math.max(-1, Math.min(1, sinElev)))
    if (elev <= 0) continue
    daylight += stepHours
    const cosAz = (Math.sin(decl) - Math.sin(lat) * sinElev) / (Math.cos(lat) * Math.cos(elev))
    let az = (Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad)
    if (H > 0) az = 360 - az
    let diff = Math.abs(az - facadeAz) % 360
    if (diff > 180) diff = 360 - diff
    if (diff < 90) facade += stepHours
  }
  return { daylight, facade }
}

/**
 * Horas de sol directo al año que recibiría una fachada SUR con cielo despejado
 * a esta latitud (geometría solar pura). Sirve de techo para normalizar a 0–100
 * las horas REALES que da un proveedor (PVGIS): una fachada que recibe tanto sol
 * como el máximo posible se acerca a 100; una norte, poco.
 */
export function southClearSkyAnnualHours(latDeg: number): number {
  const declOf = (d: number) => solarDeclination(d)
  let total = 0
  for (let m = 0; m < 12; m++) {
    const dayOfYear = DAYS_IN_MONTH.slice(0, m).reduce((a, b) => a + b, 0) + 15
    total += facadeDayHours(latDeg, declOf(dayOfYear), ORIENTATION_AZIMUTH.S!).facade * DAYS_IN_MONTH[m]!
  }
  return total
}

export function estimateSolarExposureByOrientation(latDeg: unknown, orientation: unknown): SolarExposure | null {
  if (latDeg === null || latDeg === undefined || latDeg === '') return null
  const lat = Number(latDeg)
  if (!Number.isFinite(lat) || lat < -66.5 || lat > 66.5) return null // fuera de latitudes con día/noche normal no aplica esta estimación
  const key = typeof orientation === 'string' ? orientation.trim().toUpperCase() : ''
  const facadeAz = ORIENTATION_AZIMUTH[key]
  if (facadeAz === undefined) return null

  const monthlyHours: number[] = []
  let facadeYear = 0
  let daylightYear = 0
  for (let m = 0; m < 12; m++) {
    const dayOfYear = DAYS_IN_MONTH.slice(0, m).reduce((a, b) => a + b, 0) + 15
    const decl = solarDeclination(dayOfYear)
    const { daylight, facade } = facadeDayHours(lat, decl, facadeAz)
    monthlyHours.push(round1(facade))
    facadeYear += facade * DAYS_IN_MONTH[m]!
    daylightYear += daylight * DAYS_IN_MONTH[m]!
  }
  const score = daylightYear > 0 ? Math.round((facadeYear / daylightYear) * 100) : 0
  return {
    score: Math.max(0, Math.min(100, score)),
    monthlyHours,
    confidence: 'low',
    viewerUrl: null,
    provider: 'Estimación por orientación',
    fetchedAt: null,
    estimated: true,
  }
}

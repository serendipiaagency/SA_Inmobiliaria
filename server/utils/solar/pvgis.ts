import { ORIENTATION_AZIMUTH, southClearSkyAnnualHours, type SolarExposure } from '../../../utils/solarExposure'

/**
 * Proveedor de exposición solar GRATUITO y sin clave: PVGIS, el servicio de
 * datos solares del Joint Research Centre de la Comisión Europea
 * (https://re.jrc.ec.europa.eu). Su API es pública, sin registro ni credenciales
 * y de uso libre citando la fuente. No es Shadowmap (que no publica una API
 * gratuita): PVGIS no simula las sombras de edificios concretos, pero sí usa el
 * relieve del entorno y, sobre todo, datos REALES de irradiación por satélite
 * (SARAH3), así que la exposición que da tiene en cuenta el clima de la zona
 * (nubes), no sólo la geometría del sol.
 *
 * `seriescalc` devuelve, hora a hora de un año, la irradiación sobre un plano
 * con la inclinación y la orientación que se le pidan. Para una fachada se pide
 * un plano vertical (ángulo 90°) orientado según la orientación de la propiedad.
 * De ahí se cuentan las HORAS DE SOL DIRECTO (las que tienen componente directa
 * `Gb(i)` por encima de un umbral) por mes, y el SunScore (0–100) es esas horas
 * reales frente al máximo que daría una fachada sur a esa latitud con cielo
 * despejado.
 *
 * Todo en una sola llamada por coordenada (se cachea 24 h en el servicio). Si
 * PVGIS no responde o la coordenada queda fuera de su cobertura, el servicio
 * cae a la estimación geométrica (utils/solarExposure.ts): la sección no se
 * queda sin datos.
 */

/** Azimut de PVGIS: 0 = sur, −90 = este, 90 = oeste, 180/−180 = norte. Lo derivamos del azimut geográfico (0 = norte). */
export function pvgisAspectFor(orientation: string): number | null {
  const geo = ORIENTATION_AZIMUTH[orientation.trim().toUpperCase()]
  if (geo === undefined) return null
  // Geográfico (N=0, E=90, S=180, O=270) → PVGIS (S=0, E=−90, O=90, N=±180).
  let a = geo - 180
  if (a < -180) a += 360
  return a
}

/** Irradiación directa (W/m²) a partir de la cual se cuenta una hora como «de sol directo» en la fachada. */
const BEAM_THRESHOLD = 50
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** Un año reciente y completo con cobertura SARAH3 estable: el dato es determinista y cacheable. */
export const PVGIS_YEAR = 2020
const round1 = (n: number) => Math.round(n * 10) / 10

export interface PvgisInput {
  lat: number
  lng: number
  orientation: string
  baseUrl?: string
  fetchFn?: typeof fetch
  year?: number
}

interface PvgisHour {
  time?: string
  'Gb(i)'?: number
  'Gd(i)'?: number
  'Gr(i)'?: number
}

/** Construye la URL de PVGIS seriescalc para una fachada vertical orientada. */
export function pvgisUrl(input: { lat: number; lng: number; aspect: number; baseUrl?: string; year?: number }): string {
  const base = (input.baseUrl || 'https://re.jrc.ec.europa.eu').replace(/\/$/, '')
  const year = input.year ?? PVGIS_YEAR
  const q = new URLSearchParams({
    lat: String(input.lat),
    lon: String(input.lng),
    angle: '90',
    aspect: String(input.aspect),
    components: '1',
    outputformat: 'json',
    startyear: String(year),
    endyear: String(year),
  })
  return `${base}/api/v5_3/seriescalc?${q.toString()}`
}

/**
 * Convierte la serie horaria de PVGIS en la exposición solar de la ficha. Pura:
 * no hace red, recibe las horas ya leídas. Devuelve null si los datos no sirven.
 */
export function pvgisExposureFromHourly(hourly: PvgisHour[], latDeg: number): SolarExposure | null {
  if (!Array.isArray(hourly) || !hourly.length) return null
  const monthSun = new Array(12).fill(0)
  let daylight = 0
  let annualSun = 0
  for (const h of hourly) {
    const t = typeof h.time === 'string' ? h.time : ''
    const month = Number(t.slice(4, 6))
    if (!(month >= 1 && month <= 12)) continue
    const beam = Number(h['Gb(i)']) || 0
    const global = beam + (Number(h['Gd(i)']) || 0) + (Number(h['Gr(i)']) || 0)
    if (global > 0) daylight += 1
    if (beam > BEAM_THRESHOLD) {
      monthSun[month - 1] += 1
      annualSun += 1
    }
  }
  if (daylight === 0) return null
  const ceiling = southClearSkyAnnualHours(latDeg)
  const score = ceiling > 0 ? Math.max(0, Math.min(100, Math.round((annualSun / ceiling) * 100))) : 0
  // Horas de sol directo al día de cada mes (las del año pedido entre los días del mes).
  const monthlyHours = monthSun.map((hours, m) => round1(hours / DAYS_IN_MONTH[m]!))
  return {
    score,
    monthlyHours,
    confidence: 'medium',
    viewerUrl: null,
    provider: 'PVGIS (Comisión Europea)',
    fetchedAt: new Date().toISOString(),
  }
}

/** Pide a PVGIS la exposición de una fachada. Devuelve null ante cualquier problema (y el servicio cae a la estimación). */
export async function fetchPvgisExposure(input: PvgisInput): Promise<SolarExposure | null> {
  const aspect = pvgisAspectFor(input.orientation)
  if (aspect === null || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return null
  const doFetch = input.fetchFn ?? fetch
  const url = pvgisUrl({ lat: input.lat, lng: input.lng, aspect, baseUrl: input.baseUrl, year: input.year })
  const res = await doFetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) return null
  const data = (await res.json()) as { outputs?: { hourly?: PvgisHour[] } }
  return pvgisExposureFromHourly(data?.outputs?.hourly ?? [], input.lat)
}

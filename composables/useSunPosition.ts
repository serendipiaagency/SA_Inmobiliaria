/**
 * Real sunrise/sunset/day-length for a given coordinate and date, computed
 * with the standard NOAA solar position formulas — no external API, no
 * fabricated numbers. Times are returned in UTC+4 (Dubai has no DST).
 */
const DUBAI_UTC_OFFSET_HOURS = 4

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

export interface SunTimes {
  sunriseHour: number // local hour, 0-24
  sunsetHour: number
  solarNoonHour: number
  dayLengthHours: number
}

export function computeSunTimes(lat: number, lng: number, date: Date): SunTimes {
  const rad = Math.PI / 180
  const n = dayOfYear(date)
  const gamma = ((2 * Math.PI) / 365) * (n - 1)

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))

  const latRad = lat * rad
  const haArg = (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl))
  const ha = (Math.acos(Math.max(-1, Math.min(1, haArg))) / rad) * 4 // minutes of hour-angle

  const solarNoonUTCmin = 720 - 4 * lng - eqTime
  const sunriseUTCmin = solarNoonUTCmin - ha
  const sunsetUTCmin = solarNoonUTCmin + ha

  const toLocalHour = (utcMin: number) => ((utcMin / 60 + DUBAI_UTC_OFFSET_HOURS) % 24 + 24) % 24

  return {
    sunriseHour: toLocalHour(sunriseUTCmin),
    sunsetHour: toLocalHour(sunsetUTCmin),
    solarNoonHour: toLocalHour(solarNoonUTCmin),
    dayLengthHours: (sunsetUTCmin - sunriseUTCmin) / 60,
  }
}

export function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const ORIENTATION_LABEL_KEYS: Record<string, [string, string]> = {
  N: ['orientation.label.N', 'Norte'],
  S: ['orientation.label.S', 'Sur'],
  E: ['orientation.label.E', 'Este'],
  W: ['orientation.label.W', 'Oeste'],
  NE: ['orientation.label.NE', 'Noreste'],
  NW: ['orientation.label.NW', 'Noroeste'],
  SE: ['orientation.label.SE', 'Sureste'],
  SW: ['orientation.label.SW', 'Suroeste'],
}

const ORIENTATION_NOTE_KEYS: Record<string, [string, string]> = {
  N: ['orientation.note.N', 'Luz difusa y estable durante todo el día, sin sol directo intenso — estancias más frescas.'],
  S: ['orientation.note.S', 'La orientación más solicitada en el hemisferio norte: recibe luz solar durante gran parte del día.'],
  E: ['orientation.note.E', 'Sol directo por la mañana; estancias frescas por la tarde.'],
  W: ['orientation.note.W', 'Sol directo por la tarde y al atardecer; más calor en las horas centrales del día.'],
  NE: ['orientation.note.NE', 'Luz suave por la mañana, sin sol directo intenso.'],
  NW: ['orientation.note.NW', 'Luz suave por la tarde, sin sol directo intenso.'],
  SE: ['orientation.note.SE', 'Sol directo desde la mañana hasta mediodía.'],
  SW: ['orientation.note.SW', 'Sol directo desde mediodía hasta el atardecer.'],
}

export function orientationLabel(code: string, t?: (key: string, fallback?: string) => string): string {
  const entry = ORIENTATION_LABEL_KEYS[code]
  if (!entry) return code
  return t ? t(entry[0], entry[1]) : entry[1]
}
export function orientationNote(code: string, t?: (key: string, fallback?: string) => string): string {
  const entry = ORIENTATION_NOTE_KEYS[code]
  if (!entry) return ''
  return t ? t(entry[0], entry[1]) : entry[1]
}
export function orientationAngle(code: string): number {
  const angles: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }
  return angles[code] ?? 0
}

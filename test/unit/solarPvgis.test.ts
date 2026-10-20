import { describe, expect, it } from 'vitest'
import { fetchPvgisExposure, pvgisAspectFor, pvgisExposureFromHourly, pvgisUrl } from '../../server/utils/solar/pvgis'

/** Serie horaria sintética: la directa depende de la orientación (como el simulador e2e). */
function hourly(aspect: number) {
  const facing = Math.cos((aspect * Math.PI) / 180)
  const daysIn = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const rows: any[] = []
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysIn[m - 1]; d++) {
      for (let h = 5; h <= 19; h++) {
        const noon = 1 - Math.abs(h - 12) / 7
        const beam = Math.max(0, 700 * noon * (0.5 + 0.5 * facing))
        rows.push({ time: `20200${''}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}:${String(h).padStart(2, '0')}10`.replace('20200', '2020'), 'Gb(i)': Math.round(beam), 'Gd(i)': Math.round(60 * noon), 'Gr(i)': 0 })
      }
    }
  }
  return rows
}

describe('PVGIS: orientación → azimut', () => {
  it('traduce la orientación geográfica al azimut de PVGIS (0 = sur, ±180 = norte)', () => {
    expect(pvgisAspectFor('S')).toBe(0)
    expect(Math.abs(pvgisAspectFor('N')!)).toBe(180)
    expect(pvgisAspectFor('E')).toBe(-90)
    expect(pvgisAspectFor('W')).toBe(90)
    expect(pvgisAspectFor('SE')).toBe(-45)
    expect(pvgisAspectFor('nw')).toBe(135)
    expect(pvgisAspectFor('XX')).toBeNull()
  })
  it('la URL es la de PVGIS seriescalc, plano vertical orientado, sin clave', () => {
    const u = pvgisUrl({ lat: 40.4, lng: -3.7, aspect: 0 })
    expect(u).toContain('re.jrc.ec.europa.eu/api/v5_3/seriescalc')
    expect(u).toContain('angle=90')
    expect(u).toContain('aspect=0')
    expect(u).toContain('components=1')
    expect(u).not.toMatch(/api[_-]?key|token|secret/i)
    // Base URL configurable (simulador e2e).
    expect(pvgisUrl({ lat: 1, lng: 1, aspect: 0, baseUrl: 'http://127.0.0.1:8799' })).toContain('http://127.0.0.1:8799/api/v5_3/seriescalc')
  })
})

describe('PVGIS: serie horaria → exposición', () => {
  it('produce un SunScore 0–100, 12 meses y atribución a PVGIS', () => {
    const e = pvgisExposureFromHourly(hourly(0), 40.4)!
    expect(e).toBeTruthy()
    expect(e.provider).toBe('PVGIS (Comisión Europea)')
    expect(e.confidence).toBe('medium')
    expect(e.estimated).toBeUndefined()
    expect(e.demo).toBeUndefined()
    expect(e.viewerUrl).toBeNull()
    expect(e.monthlyHours).toHaveLength(12)
    expect(e.score).toBeGreaterThanOrEqual(0)
    expect(e.score).toBeLessThanOrEqual(100)
    expect(e.fetchedAt).toBeTruthy()
  })
  it('el sur recibe muchas más horas de sol directo que el norte', () => {
    const south = pvgisExposureFromHourly(hourly(0), 40.4)!
    const north = pvgisExposureFromHourly(hourly(180), 40.4)!
    expect(south.score).toBeGreaterThan(north.score)
    expect(south.monthlyHours!.reduce((a, b) => a + b, 0)).toBeGreaterThan(north.monthlyHours!.reduce((a, b) => a + b, 0))
  })
  it('sin datos útiles devuelve null (el servicio cae a la estimación)', () => {
    expect(pvgisExposureFromHourly([], 40.4)).toBeNull()
    expect(pvgisExposureFromHourly([{ time: '20200101:1210', 'Gb(i)': 0, 'Gd(i)': 0, 'Gr(i)': 0 }], 40.4)).toBeNull()
  })
})

describe('PVGIS: fetch', () => {
  it('pide la serie y la convierte; sin orientación válida no llama a nada', async () => {
    let called = ''
    const fakeFetch = (async (url: string) => {
      called = String(url)
      return { ok: true, json: async () => ({ outputs: { hourly: hourly(0) } }) } as any
    }) as unknown as typeof fetch
    const e = await fetchPvgisExposure({ lat: 40.4, lng: -3.7, orientation: 'S', fetchFn: fakeFetch })
    expect(called).toContain('seriescalc')
    expect(e?.provider).toBe('PVGIS (Comisión Europea)')
    // Orientación inválida: ni se llama.
    called = ''
    expect(await fetchPvgisExposure({ lat: 40.4, lng: -3.7, orientation: 'ZZ', fetchFn: fakeFetch })).toBeNull()
    expect(called).toBe('')
  })
  it('un error del proveedor no rompe: devuelve null', async () => {
    const failFetch = (async () => ({ ok: false, json: async () => ({}) }) as any) as unknown as typeof fetch
    expect(await fetchPvgisExposure({ lat: 40.4, lng: -3.7, orientation: 'S', fetchFn: failFetch })).toBeNull()
  })
})

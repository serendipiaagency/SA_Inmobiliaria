import { describe, expect, it } from 'vitest'
import { estimateSolarExposureByOrientation, solarBand, type SolarExposure } from '../../utils/solarExposure'

const madridLat = 40.4

describe('estimación de exposición solar por orientación (astronomía real)', () => {
  it('devuelve una exposición marcada como estimación, con 12 meses y SunScore 0–100', () => {
    const e = estimateSolarExposureByOrientation(madridLat, 'S')!
    expect(e).toBeTruthy()
    expect(e.estimated).toBe(true)
    expect(e.provider).toBe('Estimación por orientación')
    expect(e.confidence).toBe('low')
    expect(e.viewerUrl).toBeNull()
    expect(e.monthlyHours).toHaveLength(12)
    expect(e.score).toBeGreaterThanOrEqual(0)
    expect(e.score).toBeLessThanOrEqual(100)
    for (const h of e.monthlyHours!) expect(h).toBeGreaterThanOrEqual(0), expect(h).toBeLessThanOrEqual(24)
  })

  it('en el hemisferio norte el sur recibe mucho más sol directo que el norte', () => {
    const south = estimateSolarExposureByOrientation(madridLat, 'S')!
    const north = estimateSolarExposureByOrientation(madridLat, 'N')!
    const east = estimateSolarExposureByOrientation(madridLat, 'E')!
    expect(south.score).toBeGreaterThan(north.score)
    expect(south.score).toBeGreaterThan(70) // una fachada sur en Madrid es muy soleada
    expect(north.score).toBeLessThan(40)
    // Este y oeste quedan en un punto intermedio.
    expect(east.score).toBeGreaterThan(north.score)
    expect(east.score).toBeLessThan(south.score)
    expect(solarBand(south.score).label).toMatch(/alta|excelente/i)
  })

  it('en una fachada sur el sol directo es mayor en junio que en diciembre, pero hay sol todo el año', () => {
    const s = estimateSolarExposureByOrientation(madridLat, 'S')!.monthlyHours!
    expect(s[5]).toBeGreaterThan(0) // junio
    expect(s[11]).toBeGreaterThan(0) // diciembre
    // En una fachada sur, en invierno el sol está bajo y de cara: hay bastante sol también en diciembre.
    expect(s[11]).toBeGreaterThan(3)
  })

  it('una fachada norte recibe algo de sol en verano (sol sale/pone al norte) y casi nada en invierno', () => {
    const n = estimateSolarExposureByOrientation(madridLat, 'N')!.monthlyHours!
    expect(n[5]).toBeGreaterThan(n[11]) // junio > diciembre
    expect(n[11]).toBeLessThan(1)
  })

  it('sin orientación válida o sin latitud utilizable no hay estimación (la sección no sale)', () => {
    expect(estimateSolarExposureByOrientation(madridLat, null)).toBeNull()
    expect(estimateSolarExposureByOrientation(madridLat, 'XX')).toBeNull()
    expect(estimateSolarExposureByOrientation(null, 'S')).toBeNull()
    expect(estimateSolarExposureByOrientation('nan', 'S')).toBeNull()
    expect(estimateSolarExposureByOrientation(80, 'S')).toBeNull() // latitud polar: no aplica
  })

  it('acepta la orientación en minúsculas y con espacios', () => {
    expect(estimateSolarExposureByOrientation(madridLat, ' s ')!.score).toBe(estimateSolarExposureByOrientation(madridLat, 'S')!.score)
    expect(estimateSolarExposureByOrientation(madridLat, 'sw')).toBeTruthy()
  })
})

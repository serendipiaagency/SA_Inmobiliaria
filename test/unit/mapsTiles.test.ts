import { describe, expect, it } from 'vitest'
import { configureMapTiles, mapTilesConfig, normalizeCartoKey, tileSpec, TILE_ORIGINS } from '../../utils/maps/tiles'

/**
 * Desde sep-2026 CARTO sin clave devuelve una tesela «API KEY REQUIRED» en
 * vez del mapa. Con clave, los mapas de siempre; sin ella, OpenStreetMap —
 * nunca otra vez la tesela de aviso.
 */
describe('tileSpec — capas base de los mapas', () => {
  it('sin clave de CARTO: OpenStreetMap con su URL oficial y su atribución, nunca cartocdn', () => {
    for (const key of ['light', 'dark'] as const) {
      const spec = tileSpec(key, { cartoKey: '' })
      expect(spec.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
      expect(spec.url).not.toContain('cartocdn')
      expect(spec.options.attribution).toContain('OpenStreetMap')
      expect(spec.options.maxZoom).toBe(19)
      expect(spec.options.subdomains).toBeUndefined()
    }
    // El oscuro es el mismo mapa invertido por CSS; el claro, tal cual.
    expect(tileSpec('dark', { cartoKey: '' }).options.className).toBe('pi-tiles-dark')
    expect(tileSpec('light', { cartoKey: '' }).options.className).toBeUndefined()
  })

  it('con clave de CARTO: Positron y Dark Matter con la clave en cada tesela y la atribución de CARTO y OSM', () => {
    const light = tileSpec('light', { cartoKey: 'abcDEF123_-xyz' })
    expect(light.url).toBe('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=abcDEF123_-xyz')
    expect(light.options.subdomains).toBe('abcd')
    expect(light.options.attribution).toContain('OpenStreetMap')
    expect(light.options.attribution).toContain('CARTO')
    expect(light.options.className).toBeUndefined()
    expect(tileSpec('dark', { cartoKey: 'abcDEF123_-xyz' }).url).toContain('/dark_all/')
  })

  it('el satélite es Esri con o sin clave de CARTO', () => {
    for (const cartoKey of ['', 'abcDEF123_-xyz']) {
      const spec = tileSpec('satellite', { cartoKey })
      expect(spec.url).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}')
      expect(spec.options.attribution).toBe('Esri')
    }
  })

  it('una clave con espacios alrededor se recorta; una que rompería la URL se ignora y se usa OpenStreetMap', () => {
    expect(normalizeCartoKey('  abcDEF123  ')).toBe('abcDEF123')
    expect(normalizeCartoKey('abc"><script>')).toBe('')
    expect(normalizeCartoKey('abc&key=otra')).toBe('')
    expect(normalizeCartoKey('corta')).toBe('')
    expect(normalizeCartoKey(undefined)).toBe('')
    expect(normalizeCartoKey(12345678)).toBe('')
    expect(tileSpec('light', { cartoKey: 'abc def ghi' }).url).toContain('tile.openstreetmap.org')
  })

  it('la configuración del cliente parte sin clave y guarda sólo una clave válida', () => {
    expect(mapTilesConfig().cartoKey).toBe('')
    configureMapTiles({ cartoKey: ' clave-de-prueba-123 ' })
    expect(mapTilesConfig().cartoKey).toBe('clave-de-prueba-123')
    configureMapTiles({ cartoKey: 'no válida' })
    expect(mapTilesConfig().cartoKey).toBe('')
  })

  it('la CSP admite todos los orígenes de las teselas, incluido el de CARTO sin subdominio', () => {
    for (const cartoKey of ['', 'abcDEF123_-xyz']) {
      for (const key of ['light', 'dark', 'satellite'] as const) {
        const host = new URL(tileSpec(key, { cartoKey }).url.replace('{s}', 'a').replace(/\{[a-z]\}/g, '0')).origin
        const allowed = TILE_ORIGINS.some((o) => o === host || (o.includes('*.') && host.endsWith(o.replace('https://*', ''))))
        expect(allowed, `${host} en TILE_ORIGINS`).toBe(true)
      }
    }
    expect(TILE_ORIGINS).toContain('https://basemaps.cartocdn.com')
  })
})

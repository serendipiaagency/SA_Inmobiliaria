import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { FICHA_SECTIONS, normalizeFichaSections } from '../../utils/siteBuilder/pages'
import { fichaNode, fichaNodeHasOptions } from '../../utils/siteBuilder/fichaNodes'
import { fichaSectionHasData, fichaSectionVisible, FICHA_NEEDS_DATA, type FichaDataContext } from '../../utils/fichaVisibility'
import {
  SOLAR_BANDS,
  SOLAR_DEMO_EXPOSURE,
  SOLAR_PROVIDER_STATUS,
  isAllowedViewerUrl,
  normalizeSolarExposure,
  solarBand,
  solarExplanation,
  solarJuneDecember,
} from '../../utils/solarExposure'
import { SOLAR_PROVIDERS, clearSolarCache, shadowmapProvider, solarCoordinates, solarExposureFor, type SolarProvider } from '../../server/utils/solar/service'
import { loadPublicPropertyDetail } from '../../server/utils/properties/publicDetail'
import { createD1Shim } from './helpers/d1Shim'
import { seedTenant } from './helpers/tenantFixtures'

/**
 * Cola 10 — «Exposición solar» (SunScore) bajo el mapa de la ficha. La
 * exposición la da un proveedor con licencia (Shadowmap: acceso sólo para
 * socios, sin endpoints públicos): aquí se prueba el contrato, el servicio con
 * caché y privacidad, la sección editable y, sobre todo, que sin proveedor no
 * hay ninguna cifra en la web pública.
 */
const MONTHS = [4, 5, 7, 9, 10, 10.2, 10.5, 9.5, 8, 6, 4.8, 5.3]
const good = { score: 87.4, monthlyHours: MONTHS, confidence: 'high', viewerUrl: 'https://shadowmap.org/es/explorer?lat=1&lng=2', fetchedAt: '2026-10-01T10:00:00Z' }

describe('contrato de la exposición solar', () => {
  it('acepta un dato válido y lo normaliza (puntuación entera, proveedor)', () => {
    const e = normalizeSolarExposure(good, 'Shadowmap')!
    expect(e).toMatchObject({ score: 87, confidence: 'high', provider: 'Shadowmap', fetchedAt: '2026-10-01T10:00:00Z' })
    expect(e.monthlyHours).toHaveLength(12)
    expect(e.demo).toBeUndefined()
  })
  it('descarta lo que no es un objeto o no trae puntuación', () => {
    for (const raw of [null, undefined, 'x', 5, [], {}, { score: null }, { score: '' }, { score: 'alta' }]) expect(normalizeSolarExposure(raw, 'X'), String(raw)).toBeNull()
  })
  it('una puntuación fuera de 0–100 descarta el dato entero', () => {
    expect(normalizeSolarExposure({ score: -1 }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 100.5 }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 0 }, 'X')?.score).toBe(0)
    expect(normalizeSolarExposure({ score: 100 }, 'X')?.score).toBe(100)
  })
  it('las horas deben ser doce valores entre 0 y 24; si no, se descarta todo', () => {
    expect(normalizeSolarExposure({ score: 50, monthlyHours: [1, 2] }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 50, monthlyHours: MONTHS.map((h, i) => (i === 3 ? 25 : h)) }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 50, monthlyHours: MONTHS.map((h, i) => (i === 3 ? -1 : h)) }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 50, monthlyHours: 'muchas' }, 'X')).toBeNull()
    expect(normalizeSolarExposure({ score: 50 }, 'X')?.monthlyHours).toBeNull()
  })
  it('la confianza y la fecha desconocidas quedan en null', () => {
    const e = normalizeSolarExposure({ score: 50, confidence: 'altísima', fetchedAt: 'ayer' }, 'X')!
    expect(e.confidence).toBeNull()
    expect(e.fetchedAt).toBeNull()
  })
  it('el visor sólo se acepta si es https y de los dominios del proveedor', () => {
    expect(isAllowedViewerUrl('https://shadowmap.org/es')).toBe(true)
    expect(isAllowedViewerUrl('https://app.shadowmap.org/x?a=1')).toBe(true)
    for (const bad of ['http://shadowmap.org', 'https://evil.com/shadowmap.org', 'https://shadowmap.org.evil.com', 'javascript:alert(1)', 'https://notshadowmap.org', 'no-url', '', null, 5]) expect(isAllowedViewerUrl(bad), String(bad)).toBe(false)
    expect(normalizeSolarExposure({ score: 50, viewerUrl: 'javascript:alert(1)' }, 'X')?.viewerUrl).toBeNull()
  })
  it('una marca demo viaja sólo si es exactamente true', () => {
    expect(normalizeSolarExposure({ score: 50, demo: true }, 'X')?.demo).toBe(true)
    expect(normalizeSolarExposure({ score: 50, demo: 'true' }, 'X')?.demo).toBeUndefined()
  })
})

describe('valoración con palabras', () => {
  it('cinco tramos fijos, de mayor a menor', () => {
    expect(SOLAR_BANDS.map((b) => b.min)).toEqual([85, 65, 45, 25, 0])
  })
  it('cada puntuación cae en su tramo', () => {
    expect(solarBand(100).label).toBe('Exposición solar excelente')
    expect(solarBand(85).label).toBe('Exposición solar excelente')
    expect(solarBand(84).label).toBe('Exposición solar alta')
    expect(solarBand(50).label).toBe('Exposición solar media')
    expect(solarBand(30).label).toBe('Exposición solar baja')
    expect(solarBand(0).label).toBe('Exposición solar muy baja')
  })
  it('junio y diciembre salen de los doce meses', () => {
    expect(solarJuneDecember(normalizeSolarExposure(good, 'X')!)).toEqual({ june: 10.2, december: 5.3 })
    expect(solarJuneDecember(normalizeSolarExposure({ score: 50 }, 'X')!)).toBeNull()
  })
  it('la explicación sólo cuenta lo que dicen los datos', () => {
    expect(solarExplanation(normalizeSolarExposure(good, 'X')!)).toBe('Recibe unas 10,2 h de sol directo al día en junio y 5,3 h en diciembre (4,9 h menos): en invierno hay más sombra.')
    expect(solarExplanation(normalizeSolarExposure({ score: 50, monthlyHours: Array(12).fill(8) }, 'X')!)).toContain('se mantiene estable')
    expect(solarExplanation(normalizeSolarExposure({ score: 50 }, 'X')!)).toBeNull()
  })
  it('los datos de demostración van marcados y sin visor ni fecha', () => {
    expect(SOLAR_DEMO_EXPOSURE).toMatchObject({ demo: true, viewerUrl: null, fetchedAt: null, provider: 'Datos de demostración' })
  })
})

describe('servicio con caché y privacidad', () => {
  beforeEach(() => clearSolarCache())
  const ready = (fetch: SolarProvider['fetch']): SolarProvider => ({ key: 'fake', name: 'Fake', access: 'ready', fetch })
  const prop = { organizationId: 1, lat: 43.5453, lng: -5.6619, locationPrivacy: 'exact' }

  it('Shadowmap no tiene acceso concedido: no se llama a nada y no hay dato', async () => {
    expect(SOLAR_PROVIDER_STATUS.state).toBe('pending_access')
    expect(shadowmapProvider.access).toBe('pending_access')
    const spy = vi.spyOn(shadowmapProvider, 'fetch')
    expect(await solarExposureFor(prop)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    expect(SOLAR_PROVIDERS.every((p) => p.access === 'pending_access')).toBe(true)
  })
  it('con un proveedor con acceso devuelve el dato validado', async () => {
    const e = await solarExposureFor(prop, { providers: [ready(async () => good)] })
    expect(e).toMatchObject({ score: 87, provider: 'Fake' })
  })
  it('un dato inválido del proveedor no se enseña', async () => {
    expect(await solarExposureFor(prop, { providers: [ready(async () => ({ score: 400 }))] })).toBeNull()
  })
  it('un fallo del proveedor no rompe: sin dato, y el log no lleva detalles del error', async () => {
    const log = vi.fn()
    const res = await solarExposureFor(prop, { providers: [ready(async () => { throw new Error('clave=SECRETO') })], log })
    expect(res).toBeNull()
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRETO')
  })
  it('la caché evita pedir otra vez lo mismo', async () => {
    const fetch = vi.fn(async () => good)
    const opts = { providers: [ready(fetch)] }
    await solarExposureFor(prop, opts)
    await solarExposureFor(prop, opts)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('un acierto caduca a las 24 h y una ausencia a la hora', async () => {
    let t = 0
    const fetch = vi.fn(async () => good)
    await solarExposureFor(prop, { providers: [ready(fetch)], now: () => t })
    t = 23 * 3_600_000
    await solarExposureFor(prop, { providers: [ready(fetch)], now: () => t })
    expect(fetch).toHaveBeenCalledTimes(1)
    t = 25 * 3_600_000
    await solarExposureFor(prop, { providers: [ready(fetch)], now: () => t })
    expect(fetch).toHaveBeenCalledTimes(2)

    clearSolarCache()
    const miss = vi.fn(async () => null)
    t = 0
    await solarExposureFor(prop, { providers: [ready(miss)], now: () => t })
    t = 30 * 60_000
    await solarExposureFor(prop, { providers: [ready(miss)], now: () => t })
    expect(miss).toHaveBeenCalledTimes(1)
    t = 61 * 60_000
    await solarExposureFor(prop, { providers: [ready(miss)], now: () => t })
    expect(miss).toHaveBeenCalledTimes(2)
  })
  it('la caché no se comparte entre empresas', async () => {
    const fetch = vi.fn(async () => good)
    const opts = { providers: [ready(fetch)] }
    await solarExposureFor(prop, opts)
    await solarExposureFor({ ...prop, organizationId: 2 }, opts)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('sólo se envían a un tercero coordenadas exactas, válidas y redondeadas', () => {
    expect(solarCoordinates(prop)).toEqual({ lat: 43.5453, lng: -5.6619 })
    expect(solarCoordinates({ ...prop, lat: 43.545312345, lng: -5.661912345 })).toEqual({ lat: 43.54531, lng: -5.66191 })
    expect(solarCoordinates({ ...prop, locationPrivacy: 'approximate' })).toBeNull()
    expect(solarCoordinates({ ...prop, locationPrivacy: 'hidden_number' })).toBeNull()
    expect(solarCoordinates({ ...prop, lat: null })).toBeNull()
    expect(solarCoordinates({ ...prop, lat: 0, lng: 0 })).toBeNull()
    expect(solarCoordinates({ ...prop, lat: 95 })).toBeNull()
  })
  it('con ubicación aproximada u oculta el proveedor ni se consulta', async () => {
    const fetch = vi.fn(async () => good)
    expect(await solarExposureFor({ ...prop, locationPrivacy: 'approximate' }, { providers: [ready(fetch)] })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('al proveedor le llegan sólo las coordenadas y la empresa', async () => {
    const fetch = vi.fn(async (_: unknown) => good)
    await solarExposureFor(prop, { providers: [ready(fetch)] })
    expect(fetch.mock.calls[0]![0]).toEqual({ lat: 43.5453, lng: -5.6619, orgId: 1 })
  })
})

describe('la sección en la ficha editable', () => {
  const ctx = (availability: FichaDataContext['availability']): FichaDataContext => ({ project: {}, details: null, availability, counts: {} as any } as any)
  it('está en la lista de secciones, justo debajo de la ubicación', () => {
    const keys = FICHA_SECTIONS.map((s) => s.key)
    expect(keys[keys.indexOf('ubicacion') + 1]).toBe('exposicion')
    expect(FICHA_SECTIONS.find((s) => s.key === 'exposicion')?.label).toBe('Exposición solar')
  })
  it('en un orden ya guardado entra debajo de la ubicación y visible', () => {
    const saved = FICHA_SECTIONS.filter((s) => s.key !== 'exposicion').map((s) => ({ key: s.key, visible: true }))
    const keys = normalizeFichaSections(saved).map((s) => s.key)
    expect(keys[keys.indexOf('ubicacion') + 1]).toBe('exposicion')
    expect(normalizeFichaSections(saved).find((s) => s.key === 'exposicion')?.visible).toBe(true)
  })
  it('una web que la ocultó la mantiene oculta', () => {
    const saved = FICHA_SECTIONS.map((s) => ({ key: s.key, visible: s.key !== 'exposicion' }))
    expect(normalizeFichaSections(saved).find((s) => s.key === 'exposicion')?.visible).toBe(false)
  })
  it('tiene su nodo, su título reescribible y su panel de estado, sin opciones inventadas', () => {
    expect(fichaNode('s.exposicion')).toMatchObject({ role: 'block', section: 'exposicion' })
    expect(fichaNode('t.exposicion.title')).toMatchObject({ role: 'text', parent: 's.exposicion', defaultText: 'Exposición solar' })
    expect(fichaNodeHasOptions('s.exposicion')).toBe(true)
  })
  it('sin dato real no sale, ni con «ocultar si no hay datos» apagado', () => {
    expect(FICHA_NEEDS_DATA.has('exposicion')).toBe(true)
    expect(fichaSectionHasData('exposicion', ctx({}))).toBe(false)
    expect(fichaSectionHasData('exposicion', ctx({ solar: false }))).toBe(false)
    expect(fichaSectionVisible('exposicion', ctx({ solar: false }), false)).toBe(false)
    expect(fichaSectionVisible('exposicion', ctx({ solar: false }), true)).toBe(false)
  })
  it('con dato sale', () => {
    expect(fichaSectionHasData('exposicion', ctx({ solar: true }))).toBe(true)
    expect(fichaSectionVisible('exposicion', ctx({ solar: true }), true)).toBe(true)
  })
})

describe('la ficha pública', () => {
  it('sin proveedor con licencia no hay exposición solar ni cifras, y el dato de demostración no se filtra', async () => {
    clearSolarCache()
    const { DB } = createD1Shim()
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(DB as any, { schema })
    const a = await seedTenant(db, 'SolarA')
    const [project] = await db.select().from(schema.developerProperties).where((await import('drizzle-orm')).eq(schema.developerProperties.id, a.projectId))
    await db.update(schema.developerProperties).set({ lat: 43.5453, lng: -5.6619, locationPrivacy: 'exact' } as any).where((await import('drizzle-orm')).eq(schema.developerProperties.id, a.projectId))
    const detail: any = await loadPublicPropertyDetail(db as any, { ...project, lat: 43.5453, lng: -5.6619, locationPrivacy: 'exact' } as any)
    expect(detail.solar).toBeNull()
    expect(detail.availability.solar).toBe(false)
    expect(JSON.stringify(detail)).not.toContain('Datos de demostración')
  })
})

describe('la tarjeta', () => {
  const card = readFileSync(join(import.meta.dirname, '../../components/property/SolarExposureCard.vue'), 'utf8')
  it('atribuye al proveedor y rotula la demostración', () => {
    expect(card).toContain('Proporcionado por ${exposure.provider}')
    expect(card).toContain('Datos de demostración')
    expect(card).toContain('v-if="exposure.demo"')
  })
  it('la estimación por orientación se rotula como tal y no como un proveedor', () => {
    expect(card).toContain('solar-estimate-note')
    expect(card).toContain('No tiene en cuenta las sombras')
    expect(card).toContain('Estimación de INMO según orientación y latitud')
  })
  it('el visor 3D es un enlace externo, nunca incrustado', () => {
    expect(card).toContain('target="_blank"')
    expect(card).toContain('rel="noopener noreferrer"')
    expect(card).not.toMatch(/<iframe|<embed|<object/)
    expect(card).toContain('Ver simulación solar 3D')
  })
  it('el círculo es dorado y accesible, sin animación', () => {
    expect(card).toContain('#c6a667')
    expect(card).toContain('role="img"')
    expect(card).toContain('aria-label')
    expect(card).not.toMatch(/@keyframes|animation:/)
  })
  it('no lleva ninguna cifra escrita a mano', () => {
    const template = card.slice(0, card.indexOf('<script'))
    expect(template).not.toMatch(/\b87\b|10[,.]2|5[,.]3/)
  })
  it('la ficha la monta sólo con dato y su sección', () => {
    const view = readFileSync(join(import.meta.dirname, '../../components/ficha/FichaView.vue'), 'utf8')
    expect(view).toContain("show('exposicion') && has('exposicion') && data.solar")
    expect(view).toContain('<PropertySolarExposureCard')
  })
})

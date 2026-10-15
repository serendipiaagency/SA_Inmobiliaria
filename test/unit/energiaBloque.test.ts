import { describe, expect, it } from 'vitest'
import {
  ENERGY_DISPLAY_DEFAULTS,
  MAX_ENERGY_IMAGES,
  compactEnergyOptions,
  energyCardVisible,
  energyData,
  normalizeEnergyImages,
  normalizeEnergyOptions,
} from '../../utils/energyCertificate'
import { sanitizeCoreOptions } from '../../utils/siteBuilder/pages'
import { validatePageDocument } from '../../server/utils/sitePages'

/**
 * Bloque «Eficiencia energética» del Constructor: desplegable, imágenes
 * subidas al bloque y valores que faltan. Lo que se guarda sigue siendo sólo
 * presentación (nunca los valores de la propiedad), y las imágenes se
 * sanean en el servidor igual que en el cliente.
 */

describe('opciones del bloque: desplegable e imágenes', () => {
  it('de partida: desplegable, abierto, sin imágenes y debajo de la tabla', () => {
    const d = normalizeEnergyOptions({})
    expect(d).toMatchObject({ collapsible: true, startOpen: true, images: [], imagesPosition: 'below' })
    expect(d).toEqual(ENERGY_DISPLAY_DEFAULTS)
  })

  it('un bloque ya guardado, sin las claves nuevas, se lee igual y no cambia lo que guarda', () => {
    const saved = { layout: 'compact', border: false }
    const read = normalizeEnergyOptions(saved)
    expect(read.collapsible).toBe(true)
    expect(read.startOpen).toBe(true)
    expect(compactEnergyOptions(read)).toEqual(saved)
  })

  it('sólo se guarda lo que difiere de lo de partida', () => {
    expect(compactEnergyOptions(normalizeEnergyOptions({ collapsible: true, startOpen: true, images: [], imagesPosition: 'below' }))).toEqual({})
    expect(compactEnergyOptions(normalizeEnergyOptions({ collapsible: false }))).toEqual({ collapsible: false })
    expect(compactEnergyOptions(normalizeEnergyOptions({ startOpen: false, imagesPosition: 'side' }))).toEqual({ startOpen: false, imagesPosition: 'side' })
  })

  it('valores no permitidos vuelven a lo de partida', () => {
    const o = normalizeEnergyOptions({ collapsible: 'sí', startOpen: 0, imagesPosition: 'encima' })
    expect(o.collapsible).toBe(true)
    expect(o.startOpen).toBe(true)
    expect(o.imagesPosition).toBe('below')
  })
})

describe('imágenes del bloque: saneado', () => {
  const ok = { src: 'site-builder/etiqueta.webp', alt: 'Etiqueta energética', caption: 'Escala oficial' }

  it('conserva las válidas, con su texto alternativo y su pie, y acota longitudes', () => {
    expect(normalizeEnergyImages([ok])).toEqual([ok])
    const [img] = normalizeEnergyImages([{ src: ' https://cdn.test/e.png ', alt: 'a'.repeat(500), caption: 'c'.repeat(500) }])
    expect(img!.src).toBe('https://cdn.test/e.png')
    expect(img!.alt).toHaveLength(200)
    expect(img!.caption).toHaveLength(240)
  })

  it('acepta una clave suelta (lo que guarda la galería de imágenes del Constructor)', () => {
    expect(normalizeEnergyImages(['site-builder/a.png'])).toEqual([{ src: 'site-builder/a.png', alt: '', caption: '' }])
  })

  it('descarta lo que no es una imagen del sitio: sin origen, con esquema peligroso o con rutas relativas hacia arriba', () => {
    const bad = ['', '   ', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'vbscript:x', '//evil.test/x.png', '../secreto.png', 'a/../../b.png', '/x y.png', 'file:///etc/passwd', 'ftp://x/y.png']
    expect(normalizeEnergyImages(bad.map((src) => ({ src, alt: 'x' })))).toEqual([])
    expect(normalizeEnergyImages([null, 7, {}, { alt: 'sin archivo' }, { src: 42 }])).toEqual([])
  })

  it('admite rutas del propio sitio y URL http(s)', () => {
    const srcs = ['/api/media/site-builder/a.png', 'http://cdn.test/a.png', 'https://cdn.test/a.png?x=1']
    expect(normalizeEnergyImages(srcs.map((src) => ({ src }))).map((i) => i.src)).toEqual(srcs)
  })

  it(`como mucho ${MAX_ENERGY_IMAGES}, y no es una lista si no llega una lista`, () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ src: `site-builder/${i}.png` }))
    expect(normalizeEnergyImages(many)).toHaveLength(MAX_ENERGY_IMAGES)
    expect(normalizeEnergyImages('site-builder/a.png')).toEqual([])
    expect(normalizeEnergyImages({ 0: { src: 'a.png' } })).toEqual([])
    expect(normalizeEnergyImages(undefined)).toEqual([])
  })

  it('se guardan sólo si hay alguna, en el orden en que llegaron', () => {
    const imgs = [{ src: 'site-builder/b.png', alt: '', caption: '' }, ok]
    expect(compactEnergyOptions(normalizeEnergyOptions({ images: imgs })).images).toEqual(imgs)
    expect(compactEnergyOptions(normalizeEnergyOptions({ images: [] }))).not.toHaveProperty('images')
    expect(compactEnergyOptions(normalizeEnergyOptions({ images: ['javascript:x'] }))).not.toHaveProperty('images')
  })

  it('las imágenes no hacen visible una tarjeta sin datos', () => {
    const o = normalizeEnergyOptions({ images: [ok] })
    expect(energyCardVisible(energyData({}, {}), o)).toBe(false)
    expect(energyCardVisible(energyData({ energyRating: 'C' }, {}), o)).toBe(true)
  })
})

describe('lo que guarda el servidor', () => {
  const doc = (content: Record<string, unknown>) => ({ blocks: [{ id: 'e1', type: 'energy-efficiency', version: 1, content }] })

  it('en el bloque de la biblioteca: opciones saneadas, imágenes incluidas, nunca valores de la propiedad', () => {
    const saved = validatePageDocument(
      doc({ collapsible: false, images: [{ src: 'site-builder/a.png', alt: 'A', caption: '' }, { src: 'javascript:x' }], rating: 'A', consumption: 12, emissionsValue: 4 }),
    )
    expect(saved.blocks[0]!.content).toEqual({ collapsible: false, images: [{ src: 'site-builder/a.png', alt: 'A', caption: '' }] })
  })

  it('en la zona dinámica de la ficha: las mismas opciones, con las mismas reglas', () => {
    const out = sanitizeCoreOptions('property-detail', { energy: { startOpen: false, imagesPosition: 'side', images: [{ src: 'site-builder/a.png' }, { src: '//evil.test/x.png' }] } })
    expect(out.energy).toEqual({ startOpen: false, imagesPosition: 'side', images: [{ src: 'site-builder/a.png', alt: '', caption: '' }] })
  })
})

describe('valores que faltan: la letra sin su cifra', () => {
  it('la cifra de emisiones ausente es null (nunca un 0 inventado) y la letra se conserva', () => {
    const d = energyData({ energyRating: 'A' }, { energyConsumption: 30, emissionsRating: 'A' })
    expect(d.emissions).toBeNull()
    expect(d.emissionsRating).toBe('A')
    expect(d.consumption).toBe(30)
  })
})

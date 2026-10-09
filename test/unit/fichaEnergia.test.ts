import { describe, expect, it } from 'vitest'
import {
  ENERGY_COLORS,
  ENERGY_DISPLAY_DEFAULTS,
  ENERGY_LETTERS,
  certificateStatus,
  compactEnergyOptions,
  energyBarWidth,
  energyCardVisible,
  energyData,
  formatEnergyValue,
  hasEnergyData,
  normalizeEnergyOptions,
  parseEnergyLetter,
  parseEnergyValue,
} from '../../utils/energyCertificate'
import { FICHA_NEEDS_DATA, fichaDataContext, fichaEmptySections, fichaSectionHasData, fichaSectionVisible, type FichaDataContext } from '../../utils/fichaVisibility'
import { MIN_LUMINANCE, SAGE_TONE, contactToneColors, relativeLuminance } from '../../utils/contactTone'
import { FICHA_SECTIONS, fichaDisplayOptions, normalizeFichaSections, parseContactTone, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'
import { validatePageDocument } from '../../server/utils/sitePages'
import { derivedCons } from '../../utils/fichaHighlights'
import { toPublicSheet } from '../../server/utils/propertyPrivacy'

/**
 * Megaprompt «ficha»: la etiqueta energética A–G con los datos reales de
 * Property Core, las secciones que se ocultan sin datos (con la misma regla
 * en la web y en el Constructor), el fondo de «Atendido por» y lo que el
 * Constructor guarda (sólo presentación).
 */

const t = (_key: string, fallback: string) => fallback
const typeLabel = (x: string) => x
const lum = (hex: string) => relativeLuminance([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number])

describe('etiqueta energética: escala y datos reales', () => {
  it('siete clases de la A a la G, de verde a rojo, con flechas cada vez más largas', () => {
    expect(ENERGY_LETTERS).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(ENERGY_COLORS.A).toBe('#0f8a43')
    expect(ENERGY_COLORS.G).toBe('#d7262b')
    const widths = ENERGY_LETTERS.map(energyBarWidth)
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
    expect(new Set(widths).size).toBe(7)
  })

  it('sólo letras válidas; el 0 es un dato y un negativo no', () => {
    expect(parseEnergyLetter(' e ')).toBe('E')
    expect(parseEnergyLetter('H')).toBeNull()
    expect(parseEnergyLetter('')).toBeNull()
    expect(parseEnergyValue(0)).toBe(0)
    expect(parseEnergyValue('199.2')).toBe(199.2)
    expect(parseEnergyValue(-3)).toBeNull()
    expect(parseEnergyValue('')).toBeNull()
    expect(parseEnergyValue(null)).toBeNull()
  })

  it('lee la letra de la propiedad y las cifras de su ficha ampliada, sin inventar nada', () => {
    const d = energyData({ energyRating: 'E' }, { energyConsumption: 199.2, emissionsRating: 'e', emissionsValue: '42.2', energyCertificateExpiry: '2031-05-20T00:00:00Z' })
    expect(d).toEqual({ rating: 'E', consumption: 199.2, emissionsRating: 'E', emissions: 42.2, certificateExpiry: '2031-05-20' })
    expect(hasEnergyData(energyData({}, {}))).toBe(false)
    expect(energyData(null, null).rating).toBeNull()
  })

  it('las cifras con la coma decimal del idioma', () => {
    expect(formatEnergyValue(199.2, 'es-ES')).toBe('199,2')
    expect(formatEnergyValue(42, 'en-GB')).toBe('42')
  })

  it('vigencia del certificado según su caducidad', () => {
    const today = new Date('2026-10-09T10:00:00')
    expect(certificateStatus('2031-01-01', today)).toBe('valid')
    expect(certificateStatus('2026-10-09', today)).toBe('valid')
    expect(certificateStatus('2020-01-01', today)).toBe('expired')
    expect(certificateStatus(null, today)).toBeNull()
  })

  it('sin datos que enseñar, o con todo oculto, la tabla no sale', () => {
    const opts = ENERGY_DISPLAY_DEFAULTS
    expect(energyCardVisible(energyData({}, {}), opts)).toBe(false)
    expect(energyCardVisible(energyData({ energyRating: 'B' }, {}), opts)).toBe(true)
    expect(energyCardVisible(energyData({}, { emissionsValue: 0 }), opts)).toBe(true)
    expect(energyCardVisible(energyData({ energyRating: 'B' }, {}), { ...opts, showRating: false, showConsumption: false, showEmissions: false })).toBe(false)
    // Sólo hay letra y se oculta la clasificación: nada que enseñar.
    expect(energyCardVisible(energyData({ energyRating: 'B' }, {}), { ...opts, showRating: false })).toBe(false)
  })
})

describe('opciones de la tabla (Constructor): sólo presentación', () => {
  it('lo desconocido o fuera de rango se descarta; nunca se guardan valores', () => {
    const o = normalizeEnergyOptions({ title: '  Certificado  ', layout: 'spiral', background: 'tint', radius: 'xl', rating: 'A', consumption: 12, showEmissions: false })
    expect(o.title).toBe('Certificado')
    expect(o.layout).toBe('full')
    expect(o.background).toBe('tint')
    expect(o.radius).toBe('lg')
    expect(o.showEmissions).toBe(false)
    expect(Object.keys(o)).not.toContain('rating')
    expect(Object.keys(o)).not.toContain('consumption')
  })

  it('se guarda sólo lo que difiere de lo de partida', () => {
    expect(compactEnergyOptions(normalizeEnergyOptions({}))).toEqual({})
    expect(compactEnergyOptions(normalizeEnergyOptions({ width: 'narrow', border: false }))).toEqual({ width: 'narrow', border: false })
  })

  it('la zona de la ficha guarda referencia, descripción, fondo, tabla y regla de vacíos, y nada más', () => {
    const out = sanitizeCoreOptions('property-detail', {
      showReference: false,
      showDescription: true,
      hideEmpty: false,
      contactTone: '#AABBCC',
      energy: { layout: 'compact', consumption: 199 },
      rating: 'E',
      html: '<script>',
    })
    expect(out).toEqual({ showReference: false, showDescription: true, hideEmpty: false, contactTone: '#aabbcc', energy: { layout: 'compact' } })
    expect(sanitizeCoreOptions('property-detail', { contactTone: 'red', energy: {} })).toEqual({})
  })

  it('el bloque de la biblioteca se guarda sin valores de la propiedad', () => {
    const doc = validatePageDocument({ blocks: [{ id: 'e1', type: 'energy-efficiency', content: { title: 'Energía', rating: 'A', emissions: 3, layout: 'compact' } }] })
    expect(doc.blocks[0]!.content).toEqual({ title: 'Energía', layout: 'compact' })
  })
})

describe('referencia y certificado: lo público de la ficha ampliada', () => {
  it('el código comercial sale como «Ref.»; el nº de registro del certificado y las referencias internas, no', () => {
    const sheet = { commercialCode: 'NOR-1', energyConsumption: 199.2, emissionsRating: 'E', emissionsValue: 42.2, energyCertificateExpiry: '2034-05-20', energyCertificateNumber: 'REG-9', priceMinAuthorized: 1 }
    for (const type of [null, 'Apartment', 'Villa']) {
      const pub = toPublicSheet(sheet, 'developer', type)
      expect(pub, String(type)).toMatchObject({ commercialCode: 'NOR-1', energyConsumption: 199.2, emissionsRating: 'E', emissionsValue: 42.2, energyCertificateExpiry: '2034-05-20' })
      expect(pub).not.toHaveProperty('energyCertificateNumber')
      expect(pub).not.toHaveProperty('priceMinAuthorized')
    }
  })
})

describe('ficha: opciones de partida y compatibilidad', () => {
  it('de partida: referencia, descripción y ocultar vacíos activados; fondo de marca', () => {
    const d = fichaDisplayOptions({})
    expect(d).toMatchObject({ showReference: true, showDescription: true, hideEmpty: true, contactTone: 'brand' })
    expect(d.energy).toEqual(ENERGY_DISPLAY_DEFAULTS)
  })

  it('una web que ocultó «Descripción» en la lista antigua la sigue teniendo oculta', () => {
    const legacy = { sections: [{ key: 'descripcion', visible: false }, { key: 'datos', visible: true }] }
    expect(fichaDisplayOptions(legacy).showDescription).toBe(false)
    expect(sanitizeCoreOptions('property-detail', legacy).showDescription).toBe(false)
    // Y el interruptor nuevo manda sobre la lista antigua.
    expect(fichaDisplayOptions({ ...legacy, showDescription: true }).showDescription).toBe(true)
  })

  it('la descripción ya no es una sección de la lista; la energía va tras las características', () => {
    expect(FICHA_SECTIONS.map((s) => s.key)).not.toContain('descripcion')
    const keys = normalizeFichaSections([{ key: 'score' }, { key: 'datos' }, { key: 'hipoteca' }]).map((x) => x.key)
    expect(keys.indexOf('energia')).toBe(keys.indexOf('datos') + 1)
  })

  it('el fondo sólo admite marca, blanco o un color #rrggbb', () => {
    expect(parseContactTone('brand')).toBe('brand')
    expect(parseContactTone('white')).toBe('white')
    expect(parseContactTone('#1F3A30')).toBe('#1f3a30')
    expect(parseContactTone('url(x)')).toBeNull()
    expect(parseContactTone('#fff')).toBeNull()
  })
})

describe('«Atendido por»: un fondo suave que se lee bien', () => {
  it('de partida, el color de marca de la inmobiliaria muy aclarado (no un verde fijo)', () => {
    const terracota = contactToneColors('brand', '#c2410c')!
    const azul = contactToneColors('brand', '#1d4ed8')!
    expect(terracota.bg).not.toBe(azul.bg)
    expect(lum(terracota.bg)).toBeGreaterThanOrEqual(MIN_LUMINANCE)
    expect(lum(azul.bg)).toBeGreaterThanOrEqual(MIN_LUMINANCE)
  })

  it('sin color de marca, verde salvia pálido; en blanco, la tarjeta de siempre', () => {
    expect(contactToneColors('brand', null)).toEqual(SAGE_TONE)
    expect(contactToneColors('brand', 'no-es-un-color')).toEqual(SAGE_TONE)
    expect(contactToneColors('white', '#c2410c')).toBeNull()
  })

  it('un color propio intenso se aclara lo necesario para el texto oscuro', () => {
    const c = contactToneColors('#1f3a30', null)!
    expect(lum(c.bg)).toBeGreaterThanOrEqual(MIN_LUMINANCE)
    const claro = contactToneColors('#f4f7f4', null)!
    expect(claro.bg).toBe('#f4f7f4')
  })
})

describe('secciones sin datos: la misma regla en la web y en el Constructor', () => {
  const base: FichaDataContext = { project: {}, details: {}, availability: { score: true, priceHistory: true, similar: true }, counts: {}, energy: ENERGY_DISPLAY_DEFAULTS }
  const has = (key: string, c: Partial<FichaDataContext>) => fichaSectionHasData(key, { ...base, ...c })

  it('cero no es ausencia, pero un precio 0 no es un precio de venta', () => {
    expect(has('hipoteca', { project: { price: 250000, transactionType: 'sale' } })).toBe(true)
    expect(has('hipoteca', { project: { price: 0 } })).toBe(false)
    expect(has('hipoteca', { project: { price: 1200, transactionType: 'rent' } })).toBe(false)
    expect(has('analisis', { project: { price: 250000, area: 0 } })).toBe(false)
  })

  it('cada sección con su dato: coordenadas, orientación, planos, edificio, energía', () => {
    expect(has('ubicacion', { project: { lat: 43.36, lng: -5.85 } })).toBe(true)
    expect(has('ubicacion', { project: { lat: 0, lng: 0 } })).toBe(false)
    expect(has('servicios', { project: {} })).toBe(false)
    expect(has('orientacion', { project: { orientation: ' ' } })).toBe(false)
    expect(has('orientacion', { project: { orientation: 'S' } })).toBe(true)
    expect(has('plano-estado', { counts: { condition: 2 } })).toBe(true)
    expect(has('plano-estado', { counts: {} })).toBe(false)
    expect(has('edificio-documentacion', { counts: { documents: 1 } })).toBe(true)
    expect(has('energia', { project: { energyRating: 'E' } })).toBe(true)
    expect(has('energia', { project: {} })).toBe(false)
  })

  it('lo que sólo sabe el servidor (Score, historial, similares) y lo que se sabe al cargar', () => {
    expect(has('score', { availability: { score: false } })).toBe(false)
    expect(has('precio', { availability: { priceHistory: false } })).toBe(false)
    expect(has('similares', { availability: { similar: false } })).toBe(false)
    expect(has('servicios', { project: { lat: 43.36, lng: -5.85 }, emptyAtRuntime: new Set(['servicios']) })).toBe(false)
    // «Pregúntale» no depende de datos de la propiedad.
    expect(has('preguntar', {})).toBe(true)
  })

  it('sin la regla, las secciones vacías salen con su aviso, salvo las que no tendrían nada que pintar', () => {
    const c = { ...base, availability: { score: false, priceHistory: false, similar: false } }
    expect(fichaSectionVisible('precio', c, false)).toBe(true)
    expect(fichaSectionVisible('precio', c, true)).toBe(false)
    for (const key of FICHA_NEEDS_DATA) expect(fichaSectionVisible(key, c, false), key).toBe(false)
    expect([...fichaEmptySections(['precio', 'score', 'preguntar'], c)].sort()).toEqual(['precio', 'score'])
  })

  it('cuenta con las mismas funciones que pintan las tarjetas (propiedad poblada frente a incompleta)', () => {
    const full = fichaDataContext(
      {
        project: { coverImage: 'a.jpg', bedrooms: 3, bathrooms: 2, area: 120, price: 300000, status: 'ready', hasElevator: 1, aiSummary: 'Resumen' },
        details: { kitchenType: 'independent' },
        gallery: [{ image: 'a.jpg' }, { image: 'b.jpg' }],
        media: [{ mediaType: 'pdf' }, { mediaType: 'video' }],
        documents: [{ id: 1 }],
        floorPlans: [{ image: 'p.png' }, { image: null }],
        amenities: [{ id: 1 }],
        availability: { score: true, priceHistory: true, similar: true },
      },
      { t, typeLabel, showDescription: true },
    )
    expect(full.counts).toMatchObject({ photos: 2, documents: 2, floorPlans: 1, amenities: 1, resumen: 1 })
    expect(full.counts!.quickFacts).toBe(1)
    const empty = fichaDataContext({ project: {} }, { t, typeLabel, showDescription: false })
    expect(empty.counts).toMatchObject({ photos: 0, documents: 0, floorPlans: 0, quickFacts: 0, resumen: 0 })
    expect(fichaEmptySections(FICHA_SECTIONS.map((s) => s.key), { ...empty, energy: ENERGY_DISPLAY_DEFAULTS }).has('energia')).toBe(true)
  })

  it('«Lo que debes saber» y «A considerar» leen los mismos datos', () => {
    expect(derivedCons({ status: 'new' }, t)).toHaveLength(1)
    expect(derivedCons({ energyRating: 'F', orientation: 'N' }, t)).toHaveLength(2)
    expect(derivedCons({}, t)).toEqual([])
  })
})

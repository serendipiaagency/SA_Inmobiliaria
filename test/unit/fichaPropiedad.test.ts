import { describe, expect, it } from 'vitest'
import { contrastRatio, DEFAULT_BRAND_HUE, FACT_TONE_SLOT, hexToHsl, iconPalette, MIN_ICON_CONTRAST, PALETTE_SIZE, toneFor } from '../../utils/featurePalette'
import { FEATURE_ICON_KEYS, featureIconSvg } from '../../utils/featureIcons'
import { buildQuickFacts } from '../../utils/quickFacts'

/**
 * Ficha pública de una propiedad (#107): los «Datos clave» — qué datos salen,
 * con qué icono y con qué color.
 */

const t = (_key: string, fallback: string) => fallback
const typeLabel = (type: string) => ({ Apartment: 'Piso', House: 'Casa' })[type] || type

describe('paleta de los iconos: derivada de la marca, estable y legible', () => {
  it('sin color de marca (o con un gris) usa la de Portal INMO', () => {
    expect(iconPalette(null)).toEqual(iconPalette(undefined))
    expect(iconPalette('#777777')).toEqual(iconPalette(null))
    expect(hexToHsl(iconPalette(null)[0].fg)!.h).toBeCloseTo(DEFAULT_BRAND_HUE, -1)
  })

  it('cambia con la marca de cada inmobiliaria y es determinista', () => {
    expect(iconPalette('#1e5aa8')).not.toEqual(iconPalette(null))
    expect(iconPalette('#1e5aa8')).toEqual(iconPalette('#1e5aa8'))
    expect(iconPalette('#1e5aa8')).toHaveLength(PALETTE_SIZE)
  })

  it('todos los colores son distintos entre sí y cada icono contrasta con su fondo (AA) con cualquier marca', () => {
    const brands = [null, '#c2622d', '#1f3a30', '#ffcc00', '#ff00ff', '#00ffff', '#000080', '#e11d48']
    for (let h = 0; h < 360; h += 20) brands.push(`#${[0, 1, 2].map((i) => Math.round(127 + 100 * Math.cos(((h + i * 120) * Math.PI) / 180)).toString(16).padStart(2, '0')).join('')}`)
    for (const brand of brands) {
      const p = iconPalette(brand)
      expect(new Set(p.map((x) => x.fg)).size, String(brand)).toBe(PALETTE_SIZE)
      for (const tone of p) {
        expect(contrastRatio(tone.fg, tone.bg), `${brand}: ${tone.fg} sobre ${tone.bg}`).toBeGreaterThanOrEqual(MIN_ICON_CONTRAST)
        expect(contrastRatio(tone.fg, '#ffffff'), `${brand}: ${tone.fg} sobre blanco`).toBeGreaterThanOrEqual(MIN_ICON_CONTRAST)
      }
    }
  })

  it('el mismo dato tiene siempre el mismo color; los de agua, verde y sol, el suyo', () => {
    const p = iconPalette('#c2622d')
    expect(toneFor('pool', p)).toEqual(toneFor('airConditioning', p))
    expect(toneFor('garden', p)).toEqual(toneFor('plot', p))
    expect(toneFor('pool', p)).not.toEqual(toneFor('garden', p))
    expect(toneFor('dato-sin-color', p)).toEqual(p[0])
  })
})

describe('iconos: uno por dato, bien formados', () => {
  it('cada dato con color tiene su icono, y el SVG es válido', () => {
    for (const key of Object.keys(FACT_TONE_SLOT)) expect(FEATURE_ICON_KEYS, key).toContain(key)
    for (const key of FEATURE_ICON_KEYS) {
      const svg = featureIconSvg(key)
      expect(svg.startsWith('<svg ') && svg.endsWith('</svg>'), key).toBe(true)
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('aria-hidden="true"')
      // Etiquetas equilibradas y sólo formas SVG; nada de texto, emojis ni caracteres sueltos.
      const opened = (svg.match(/<(path|circle|rect)\b/g) || []).length
      const selfClosed = (svg.match(/<(path|circle|rect)\b[^>]*\/>/g) || []).length
      expect(opened, key).toBeGreaterThan(0)
      expect(selfClosed, key).toBe(opened)
      expect(svg.replace(/<[^>]+>/g, ''), key).toBe('')
      for (const d of svg.match(/ d="([^"]*)"/g) || []) expect(d, key).toMatch(/^ d="[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+"$/)
    }
    expect(featureIconSvg('desconocido')).toBe('')
  })
})

describe('Datos clave: sólo lo que la propiedad tiene', () => {
  it('obra nueva con extras: cada dato con su etiqueta y su valor', () => {
    const facts = buildQuickFacts(
      { propertyType: 'Apartment', yearBuilt: 2024, status: 'under_construction', handoverDate: '2027-06', condition: 'new', floor: '3', hasElevator: 1, hasGarage: 1, garageSpaces: 2, hasTerrace: 1, terraceArea: 18.4, hasPool: 1, storageArea: 6, petsAllowed: 1 },
      { heating: 'heat_pump', hasAirConditioning: 1 },
      t,
      typeLabel,
    )
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f]))
    expect(Object.keys(byKey)).toEqual(['propertyType', 'yearBuilt', 'status', 'condition', 'floor', 'elevator', 'garage', 'terrace', 'pool', 'storage', 'heating', 'airConditioning', 'pets'])
    expect(byKey.propertyType.value).toBe('Piso')
    expect(byKey.status).toMatchObject({ label: 'Entrega prevista', value: '2027-06' })
    expect(byKey.condition.value).toBe('A estrenar')
    expect(byKey.garage.value).toBe('2 plazas')
    expect(byKey.terrace.value).toBe('18 m²')
    expect(byKey.storage).toMatchObject({ label: 'Trastero', value: '6 m²' })
    expect(byKey.heating.value).toBe('Bomba de calor')
  })

  it('segunda mano con parcela y jardín; lo vacío, a 0 o quitado por privacidad no sale', () => {
    const facts = buildQuickFacts(
      { propertyType: 'House', status: 'ready', plotArea: 850, hasGarden: 1, gardenArea: 0, hasGarage: 0, garageSpaces: 0, hasElevator: 0, floor: null, storageArea: 0, street: null },
      { hasAirConditioning: 0 },
      t,
      typeLabel,
    )
    expect(facts.map((f) => f.key)).toEqual(['propertyType', 'status', 'garden', 'plot'])
    expect(facts.find((f) => f.key === 'garden')!.value).toBe('Sí')
    expect(facts.find((f) => f.key === 'plot')!.value).toBe('850 m²')
  })

  it('sin datos, ninguno (y la sección no se pinta)', () => {
    expect(buildQuickFacts({}, null, t, typeLabel)).toEqual([])
  })
})

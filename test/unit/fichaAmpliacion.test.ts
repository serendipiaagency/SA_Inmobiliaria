import { describe, expect, it } from 'vitest'
import { MORTGAGE_DEFAULTS, computeMortgage, monthlyPayment, purchaseAssumptions } from '../../utils/mortgage'
import { buildingRows, conditionRows } from '../../utils/propertyFacts'
import { floorPlanTitle } from '../../utils/floorPlans'
import { normalizeFloorPlan } from '../../server/utils/properties/floorPlans'
import { FICHA_SECTIONS, fichaSectionLayout, normalizeFichaSections, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'

/**
 * Ficha pública ampliada (#110): la calculadora «Hipoteca y costes», el
 * «Estado del inmueble» y «El edificio», los planos y las secciones que se
 * ordenan u ocultan desde el Constructor.
 */

const t = (_key: string, fallback: string) => fallback

describe('calculadora: cuánto hace falta y cuánto al mes', () => {
  it('cuota francesa de referencia: 160.000 € al 3,5 % a 25 años', () => {
    expect(Math.round(monthlyPayment(160000, 3.5, 25))).toBe(801)
  })

  it('sin interés, el préstamo entre los meses; sin préstamo, nada', () => {
    expect(monthlyPayment(120000, 0, 10)).toBe(1000)
    expect(monthlyPayment(0, 3.5, 25)).toBe(0)
  })

  it('lo que hay que tener es entrada + impuestos + gastos, y se financia el resto', () => {
    const r = computeMortgage({ price: 200000, downPct: 20, ratePct: 3.5, years: 25, taxPct: 11.5, feesPct: 1 })
    expect(r.downPayment).toBe(40000)
    expect(r.taxes).toBe(23000)
    expect(r.fees).toBe(2000)
    expect(r.cashNeeded).toBe(65000)
    expect(r.loan).toBe(160000)
    expect(r.monthly).toBe(801)
    expect(r.totalInterest).toBe(80299)
  })

  it('los gastos fijos se suman a los porcentuales', () => {
    const r = computeMortgage({ price: 1000000, downPct: 20, ratePct: 4, years: 25, taxPct: 4, feesPct: 0, feesFixed: 4780 })
    expect(r.taxes).toBe(40000)
    expect(r.fees).toBe(4780)
  })

  it('valores fuera de rango no rompen el cálculo', () => {
    const r = computeMortgage({ price: 100000, downPct: 140, ratePct: -2, years: 0, taxPct: Number.NaN, feesPct: 99 })
    expect(r.downPayment).toBe(100000)
    expect(r.loan).toBe(0)
    expect(r.monthly).toBe(0)
    expect(r.taxes).toBe(0)
    expect(r.fees).toBe(20000)
  })

  it('los supuestos dependen del mercado de la agencia y se dicen', () => {
    const es = purchaseAssumptions('eur', true)
    expect(es.market).toBe('es')
    expect(es.taxPct).toBe(11.5)
    expect(es.note).toMatch(/IVA/)
    const ae = purchaseAssumptions('AED', true)
    expect(ae.market).toBe('ae')
    expect(ae.taxPct).toBe(4)
    expect(ae.feesFixed).toBeGreaterThan(purchaseAssumptions('AED', false).feesFixed)
    const other = purchaseAssumptions('USD', false)
    expect(other.market).toBe('generic')
    expect(other.taxPct + other.feesPct + other.feesFixed).toBe(0)
  })

  it('valores de partida editables: 20 % de entrada, 25 años', () => {
    expect(MORTGAGE_DEFAULTS).toMatchObject({ downPct: 20, years: 25 })
  })
})

describe('estado del inmueble: sólo lo que consta', () => {
  it('sin datos, ninguna fila', () => {
    expect(conditionRows({}, null, t)).toEqual([])
    expect(buildingRows({}, {}, t)).toEqual([])
  })

  it('obra nueva sin estado guardado se dice tal cual; un estado guardado manda', () => {
    expect(conditionRows({ status: 'under_construction' }, null, t)[0]).toMatchObject({ key: 'condition', value: 'Obra nueva' })
    expect(conditionRows({ status: 'new', condition: 'good' }, null, t)[0]).toMatchObject({ key: 'condition', value: 'Buen estado' })
  })

  it('un «No» marcado se enseña; sin marcar, no', () => {
    expect(conditionRows({}, { isRenovated: 0 }, t)).toEqual([expect.objectContaining({ key: 'renovated', value: 'No' })])
    expect(conditionRows({}, { isRenovated: null }, t)).toEqual([])
  })

  it('amueblado: sí, no y parcialmente se enseñan; sin indicar, no', () => {
    expect(conditionRows({ furnished: null }, null, t)).toEqual([])
    expect(conditionRows({ furnished: 'yes' }, null, t)).toEqual([expect.objectContaining({ key: 'furnished', value: 'Sí' })])
    expect(conditionRows({ furnished: 'no' }, null, t)).toEqual([expect.objectContaining({ key: 'furnished', value: 'No' })])
    expect(conditionRows({ furnished: 'partially' }, null, t)).toEqual([expect.objectContaining({ key: 'furnished', value: 'Parcialmente' })])
  })

  it('las casillas de la propiedad sólo enseñan el «Sí» (0 es también «sin indicar»)', () => {
    expect(buildingRows({ hasElevator: 0, accessible: 0 }, null, t)).toEqual([])
    expect(buildingRows({ hasElevator: 1 }, null, t)).toEqual([expect.objectContaining({ key: 'elevator', value: 'Sí' })])
  })

  it('cocina, baños y ventanas con las etiquetas de la ficha ampliada', () => {
    const rows = conditionRows({}, { kitchenEquipment: 'equipped', bathroomsCondition: 'renovated', hasAirConditioning: 1, hasAerothermal: 1 }, t)
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey.kitchen).toBe('Equipada')
    expect(byKey.bathrooms).toBe('Reformados')
    expect(byKey.climate).toBe('Aire acondicionado · Aerotermia')
  })
})

describe('el edificio, separado de la vivienda', () => {
  it('plantas, viviendas, zonas comunes y comunidad', () => {
    const rows = buildingRows({ yearBuilt: 2008, hasElevator: 1 }, { buildingFloors: 6, unitsPerFloor: 4, hasCommunityPool: 1, hasGym: 1, hasCommunityGarden: 1, buildingCondition: 'good', communityFeeMonthly: 85 }, t, (n) => `${n} €`)
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey.yearBuilt).toBe('2008')
    expect(byKey.floors).toBe('6')
    expect(byKey.unitsPerFloor).toBe('4')
    expect(byKey.elevator).toBe('Sí')
    expect(byKey.commonAreas).toBe('Jardín, piscina y gimnasio')
    expect(byKey.buildingCondition).toBe('Buen estado')
    expect(byKey.community).toBe('85 € / mes')
  })

  it('la comunidad no sale sin formateador de moneda', () => {
    expect(buildingRows({}, { communityFeeMonthly: 85 }, t)).toEqual([])
  })
})

describe('planos', () => {
  it('el título: el suyo, la categoría, el tipo o «Plano N»', () => {
    expect(floorPlanTitle({ title: ' Planta baja ' }, 0)).toBe('Planta baja')
    expect(floorPlanTitle({ title: '', category: '2 dormitorios' }, 0)).toBe('2 dormitorios')
    expect(floorPlanTitle({ unitType: 'Ático' }, 3)).toBe('Ático')
    expect(floorPlanTitle({}, 1)).toBe('Plano 2')
  })

  it('lo que llega del panel se sanea: título, orden y visibilidad', () => {
    expect(normalizeFloorPlan({ title: `  ${'x'.repeat(200)}  `, sortOrder: '3.6', isPublic: '0' })).toEqual({ title: 'x'.repeat(120), sortOrder: 4, isPublic: 0 })
    expect(normalizeFloorPlan({ title: '   ', sortOrder: -2, isPublic: '' })).toEqual({ title: null, sortOrder: 0, isPublic: 1 })
    expect(normalizeFloorPlan({ isPublic: true })).toEqual({ isPublic: 1 })
    // Lo que no viene no se toca (un PUT parcial no cambia el orden ni la visibilidad).
    expect(normalizeFloorPlan({ image: 'k.png' })).toEqual({ image: 'k.png' })
  })
})

describe('secciones de la ficha en el Constructor', () => {
  it('sin configuración, todas visibles y en el orden de partida', () => {
    const list = normalizeFichaSections(undefined)
    expect(list.map((x) => x.key)).toEqual(FICHA_SECTIONS.map((x) => x.key))
    expect(list.every((x) => x.visible)).toBe(true)
    // El orden de la referencia del rediseño (#111): características, la tabla energética (megaprompt «ficha»), Score, plano y estado, edificio y documentación.
    // La descripción ya no es una sección: va en la tarjeta principal.
    expect(list.slice(0, 5).map((x) => x.key)).toEqual(['datos', 'energia', 'score', 'plano-estado', 'edificio-documentacion'])
    expect(list.map((x) => x.key)).not.toContain('descripcion')
  })

  it('respeta el orden guardado, descarta claves desconocidas y repetidas y completa las que falten', () => {
    const list = normalizeFichaSections([{ key: 'hipoteca' }, { key: 'nope', visible: false }, { key: 'datos', visible: false }, { key: 'hipoteca', visible: false }, 'basura'])
    expect(list.slice(0, 2)).toEqual([{ key: 'hipoteca', visible: true }, { key: 'datos', visible: false }])
    expect(list).toHaveLength(FICHA_SECTIONS.length)
    expect(new Set(list.map((x) => x.key)).size).toBe(FICHA_SECTIONS.length)
  })

  it('una web con su orden ya guardado recibe la tabla energética junto a las características', () => {
    const saved = [{ key: 'hipoteca' }, { key: 'datos', visible: false }, { key: 'descripcion', visible: false }, { key: 'score' }]
    const list = normalizeFichaSections(saved)
    expect(list.slice(0, 4).map((x) => x.key)).toEqual(['hipoteca', 'datos', 'energia', 'score'])
    expect(list.find((x) => x.key === 'energia')!.visible).toBe(true)
    expect(list.map((x) => x.key)).not.toContain('descripcion')
  })

  it('el puesto de cada sección y las ocultas, para pintar la ficha', () => {
    const { order, hidden } = fichaSectionLayout([{ key: 'ubicacion' }, { key: 'score', visible: false }])
    expect(order.ubicacion).toBe(1)
    expect(order.score).toBe(2)
    expect(order.datos).toBe(3)
    expect([...hidden]).toEqual(['score'])
  })

  it('el servidor guarda sólo opciones válidas de la zona de la ficha', () => {
    const out = sanitizeCoreOptions('property-detail', { showFeatured: false, featuredTitle: '  Exclusivas  ', sections: [{ key: 'hipoteca', visible: false }], html: '<script>' })
    expect(out.showFeatured).toBe(false)
    expect(out.featuredTitle).toBe('Exclusivas')
    expect((out.sections as any[])[0]).toEqual({ key: 'hipoteca', visible: false })
    expect(out).not.toHaveProperty('html')
    expect(sanitizeCoreOptions('property-detail', { sections: 'todas' })).not.toHaveProperty('sections')
    // Otras zonas dinámicas no admiten secciones.
    expect(sanitizeCoreOptions('properties-listing', { sections: [{ key: 'datos' }] })).toEqual({})
  })
})

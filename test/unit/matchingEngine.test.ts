import { describe, expect, it } from 'vitest'
import { evaluateMatch, featureValue, distanceKm, WEIGHTS, RULES_VERSION, type MatchableProperty, type MatchableRequirement } from '../../server/utils/matching/engine'

/**
 * Lo que se prueba aquí no es "que devuelva un número", sino las tres reglas
 * que hacen que ese número se pueda defender delante de un cliente:
 * que la explicación salga del motor, que un dato ausente no descarte a nadie,
 * y que un imprescindible no se diluya en la media ponderada.
 */

function property(overrides: Partial<MatchableProperty> = {}): MatchableProperty {
  return {
    id: 1,
    transactionType: 'sale',
    propertyType: 'Apartment',
    price: 600000,
    area: 90,
    bedrooms: 3,
    bathrooms: 2,
    city: 'Madrid',
    district: 'Chamberí',
    // Ficha repasada: los 0 de las características significan "no lo tiene".
    featuresReviewedAt: '2026-01-01T00:00:00.000Z',
    hasElevator: 1,
    hasTerrace: 1,
    hasGarage: 0,
    hasPool: 0,
    hasGarden: 0,
    ...overrides,
  }
}

function requirement(overrides: Partial<MatchableRequirement> = {}): MatchableRequirement {
  return {
    id: 1,
    operation: 'sale',
    ...overrides,
  }
}

describe('motor de matching — explicabilidad', () => {
  it('cada criterio dice qué se comparó, no sólo si pasó', () => {
    const result = evaluateMatch(
      property({ area: 78 }),
      requirement({ priceMax: 650000, areaMin: 80, bedroomsMin: 2, desiredZones: [{ district: 'Chamberí' }] }),
    )

    // El ejemplo de la fase: "△ 78 m² frente a 80 m² deseados".
    const area = result.criteria.find((c) => c.key === 'area')!
    expect(area.outcome).toBe('partial')
    expect(area.detail).toContain('78 m²')
    expect(area.detail).toContain('80 m²')
    expect(result.explanation.some((line) => line.startsWith('△') && line.includes('78 m²'))).toBe(true)
    expect(result.explanation.some((line) => line.startsWith('✓') && line.includes('Chamberí'))).toBe(true)
  })

  it('el score se puede reconstruir desde los pesos del desglose', () => {
    const result = evaluateMatch(property(), requirement({ priceMax: 650000, bedroomsMin: 2 }))
    const scorable = result.criteria.filter((c) => c.weight > 0 && c.outcome !== 'unknown')
    const possible = scorable.reduce((s, c) => s + c.weight, 0)
    const earned = scorable.reduce((s, c) => s + c.earned, 0)
    expect(result.score).toBe(Math.round((earned / possible) * 100))
  })

  it('es determinista: los mismos datos dan exactamente el mismo resultado', () => {
    const p = property({ area: 78 })
    const r = requirement({ priceMax: 650000, areaMin: 80, desiredZones: [{ district: 'Chamberí' }] })
    expect(JSON.stringify(evaluateMatch(p, r))).toBe(JSON.stringify(evaluateMatch(p, r)))
  })

  it('el resultado lleva la versión de las reglas que lo produjo', () => {
    expect(evaluateMatch(property(), requirement({ priceMax: 650000 })).rulesVersion).toBe(RULES_VERSION)
  })
})

describe('motor de matching — UNKNOWN no es FALSE', () => {
  it('una ficha sin repasar deja las características en desconocido, no en "no lo tiene"', () => {
    const sinRepasar = property({ featuresReviewedAt: null, hasPool: 0 })
    expect(featureValue(sinRepasar, 'pool')).toBeNull()

    const repasada = property({ featuresReviewedAt: '2026-01-01T00:00:00.000Z', hasPool: 0 })
    expect(featureValue(repasada, 'pool')).toBe(false)
  })

  it('un 1 siempre es una afirmación, aunque nadie haya repasado la ficha', () => {
    // El valor por defecto de la columna es 0, así que un 1 sólo puede venir
    // de que alguien lo marcara.
    expect(featureValue(property({ featuresReviewedAt: null, hasPool: 1 }), 'pool')).toBe(true)
  })

  it('piscina imprescindible sin dato NO descarta el inmueble: lo deja para revisar', () => {
    const result = evaluateMatch(
      property({ featuresReviewedAt: null, hasPool: 0 }),
      requirement({ criteria: [{ criterionType: 'pool', importance: 'required', valueBool: 1 }] }),
    )

    expect(result.eligibility).toBe('needs_review')
    expect(result.unknown.map((c) => c.key)).toContain('pool')
    expect(result.failed).toHaveLength(0)
    expect(result.explanation.some((l) => l.startsWith('?') && l.includes('piscina'))).toBe(true)
  })

  it('piscina imprescindible con la ficha repasada y sin piscina SÍ descarta', () => {
    const result = evaluateMatch(
      property({ featuresReviewedAt: '2026-01-01T00:00:00.000Z', hasPool: 0 }),
      requirement({ criteria: [{ criterionType: 'pool', importance: 'required', valueBool: 1 }] }),
    )
    expect(result.eligibility).toBe('ineligible')
    expect(result.failed.map((c) => c.key)).toContain('pool')
  })

  it('un dato desconocido no baja el score: se queda fuera del cálculo y se dice', () => {
    const conDato = evaluateMatch(property(), requirement({ priceMax: 650000, bedroomsMin: 2 }))
    const sinDato = evaluateMatch(property({ bedrooms: null }), requirement({ priceMax: 650000, bedroomsMin: 2 }))

    expect(sinDato.score).toBe(conDato.score) // ambos cumplen lo que se pudo medir
    expect(sinDato.unknown.map((c) => c.key)).toContain('bedrooms')
    // Pero la confianza baja: no se está fingiendo que se comprobó todo.
    expect(sinDato.confidence).toBeLessThan(conDato.confidence)
  })

  it('un precio sin especificar no significa cero: no genera ningún criterio', () => {
    const result = evaluateMatch(property({ price: 2_000_000 }), requirement({ bedroomsMin: 2 }))
    expect(result.criteria.find((c) => c.key === 'price')).toBeUndefined()
    expect(result.eligibility).toBe('eligible')
  })
})

describe('motor de matching — imprescindible vs preferible', () => {
  it('un imprescindible incumplido descarta; no resta puntos', () => {
    const result = evaluateMatch(
      property({ price: 900000 }),
      requirement({ priceMax: 650000, criteria: [{ criterionType: 'price', importance: 'required' }] }),
    )
    expect(result.eligibility).toBe('ineligible')
    const price = result.criteria.find((c) => c.key === 'price')!
    expect(price.weight).toBe(0) // no participa en el score
  })

  it('un preferible incumplido baja el score pero el inmueble sigue siendo elegible', () => {
    const result = evaluateMatch(
      property({ featuresReviewedAt: '2026-01-01T00:00:00.000Z', hasGarage: 0 }),
      requirement({
        priceMax: 650000,
        criteria: [
          { criterionType: 'price', importance: 'preferred' },
          { criterionType: 'garage', importance: 'preferred', valueBool: 1 },
        ],
      }),
    )
    expect(result.eligibility).toBe('eligible')
    expect(result.failed.map((c) => c.key)).toContain('garage')
    expect(result.score).toBeLessThan(100)
  })

  it('un criterio indiferente no puntúa ni penaliza: desaparece del desglose', () => {
    const result = evaluateMatch(
      property({ featuresReviewedAt: '2026-01-01T00:00:00.000Z', hasPool: 0 }),
      requirement({ priceMax: 650000, criteria: [{ criterionType: 'pool', importance: 'indifferent', valueBool: 1 }] }),
    )
    expect(result.criteria.find((c) => c.key === 'pool')).toBeUndefined()
    expect(result.score).toBe(100)
  })

  it('un imprescindible cumplido a medias no se decide solo: queda para revisar', () => {
    const result = evaluateMatch(
      property({ area: 78 }),
      requirement({ areaMin: 80, criteria: [{ criterionType: 'area', importance: 'required' }] }),
    )
    expect(result.eligibility).toBe('needs_review')
    expect(result.partial.map((c) => c.key)).toContain('area')
  })

  it('comprar no es alquilar: la operación descarta antes de puntuar nada', () => {
    const result = evaluateMatch(property({ transactionType: 'rent' }), requirement({ operation: 'sale', priceMax: 650000 }))
    expect(result.eligibility).toBe('ineligible')
    expect(result.criteria).toHaveLength(1)
    expect(result.criteria[0].key).toBe('operation')
  })
})

describe('motor de matching — zonas', () => {
  it('una zona excluida tiene precedencia sobre una zona deseada más amplia', () => {
    // Deseado: Madrid. Excluido: Lavapiés. Un piso en Lavapiés no es un
    // cumplimiento pleno por estar dentro de Madrid.
    const result = evaluateMatch(
      property({ city: 'Madrid', district: 'Lavapiés' }),
      requirement({ desiredZones: [{ city: 'Madrid' }], excludedZones: [{ district: 'Lavapiés' }] }),
    )
    const zone = result.criteria.find((c) => c.key === 'zone')!
    expect(zone.outcome).toBe('failed')
    expect(zone.detail).toContain('Lavapiés')
  })

  it('varias zonas deseadas: basta con estar en una', () => {
    const result = evaluateMatch(
      property({ district: 'Salamanca' }),
      requirement({ desiredZones: [{ district: 'Chamberí' }, { district: 'Salamanca' }] }),
    )
    expect(result.criteria.find((c) => c.key === 'zone')!.outcome).toBe('matched')
  })

  it('las tildes y mayúsculas no rompen la comparación de zonas', () => {
    const result = evaluateMatch(property({ district: 'chamberi' }), requirement({ desiredZones: [{ district: 'Chamberí' }] }))
    expect(result.criteria.find((c) => c.key === 'zone')!.outcome).toBe('matched')
  })

  it('un inmueble sin ubicación comparable queda desconocido, no fuera de zona', () => {
    const result = evaluateMatch(
      property({ city: null, district: null, postalCode: null, community: null }),
      requirement({ desiredZones: [{ district: 'Chamberí' }] }),
    )
    expect(result.criteria.find((c) => c.key === 'zone')!.outcome).toBe('unknown')
  })

  it('el radio se mide en el servidor y penaliza gradualmente cerca del límite', () => {
    const madrid = { lat: 40.4168, lng: -3.7038 }
    const cerca = evaluateMatch(
      property({ lat: 40.43, lng: -3.71 }),
      requirement({ centerLat: madrid.lat, centerLng: madrid.lng, radiusKm: 5 }),
    )
    expect(cerca.criteria.find((c) => c.key === 'zone')!.outcome).toBe('matched')

    const lejos = evaluateMatch(
      property({ lat: 41.3851, lng: 2.1734 }), // Barcelona
      requirement({ centerLat: madrid.lat, centerLng: madrid.lng, radiusKm: 5 }),
    )
    expect(lejos.criteria.find((c) => c.key === 'zone')!.outcome).toBe('failed')
  })

  it('distanceKm da la distancia real entre Madrid y Barcelona', () => {
    const km = distanceKm(40.4168, -3.7038, 41.3851, 2.1734)
    expect(km).toBeGreaterThan(490)
    expect(km).toBeLessThan(520)
  })
})

describe('motor de matching — pesos', () => {
  it('todos los pesos están centralizados en un único sitio', () => {
    // Si alguien añade un criterio nuevo y reparte su peso por el código, este
    // test no lo detecta — pero sí obliga a que los que existen vivan aquí.
    for (const key of ['price', 'zone', 'bedrooms', 'area', 'terrace', 'garage']) {
      expect(WEIGHTS[key]).toBeGreaterThan(0)
    }
  })

  it('el precio pesa más que tener jardín', () => {
    expect(WEIGHTS.price).toBeGreaterThan(WEIGHTS.garden)
  })

  it('sin ningún criterio evaluable el score es null, no 100', () => {
    const result = evaluateMatch(property(), requirement())
    expect(result.score).toBeNull()
    expect(result.eligibility).toBe('eligible')
  })
})

import { describe, expect, it } from 'vitest'
import {
  validateBuyerRequirement,
  summarizeRequirement,
  BuyerRequirementValidationError,
  PROPERTY_TYPES,
  type BuyerRequirementInput,
} from '../../server/utils/buyerRequirements/service'

const base: BuyerRequirementInput = { contactId: 1 }

describe('BuyerRequirement — validación', () => {
  it('exige un contacto: una necesidad sin persona no existe', () => {
    expect(() => validateBuyerRequirement({ ...base, contactId: 0 })).toThrow(BuyerRequirementValidationError)
  })

  it('rechaza un precio mínimo mayor que el máximo', () => {
    expect(() => validateBuyerRequirement({ ...base, priceMin: 700000, priceMax: 650000 })).toThrow(/mínimo no puede superar/)
  })

  it('acepta un máximo sin mínimo, y un mínimo sin máximo: ambos son opcionales', () => {
    expect(() => validateBuyerRequirement({ ...base, priceMax: 650000 })).not.toThrow()
    expect(() => validateBuyerRequirement({ ...base, priceMin: 200000 })).not.toThrow()
  })

  it('rechaza superficie mínima mayor que la máxima', () => {
    expect(() => validateBuyerRequirement({ ...base, areaMin: 120, areaMax: 80 })).toThrow(/superficie mínima/)
  })

  it('rechaza tipos de inmueble que no están en el catálogo', () => {
    expect(() => validateBuyerRequirement({ ...base, propertyTypes: ['Castillo'] })).toThrow(/no reconocido/)
    expect(() => validateBuyerRequirement({ ...base, propertyTypes: [...PROPERTY_TYPES] })).not.toThrow()
  })

  it('un radio sin coordenadas de centro no significa nada', () => {
    expect(() => validateBuyerRequirement({ ...base, radiusKm: 5 })).toThrow(/coordenadas de centro/)
    expect(() => validateBuyerRequirement({ ...base, radiusKm: 5, centerLat: 40.43, centerLng: -3.7 })).not.toThrow()
  })

  it('rechaza habitaciones no enteras o negativas', () => {
    expect(() => validateBuyerRequirement({ ...base, bedroomsMin: 2.5 })).toThrow(/entero/)
    expect(() => validateBuyerRequirement({ ...base, bedroomsMin: -1 })).toThrow(/entero/)
  })

  it('rechaza importancias inventadas', () => {
    expect(() => validateBuyerRequirement({ ...base, importances: { terrace: 'muy_importante' as never } })).toThrow(/Importancia no reconocida/)
  })

  it('acepta las tres importancias del dominio', () => {
    expect(() =>
      validateBuyerRequirement({ ...base, importances: { terrace: 'required', elevator: 'preferred', pool: 'indifferent' } }),
    ).not.toThrow()
  })

  it('rechaza estados de hipoteca fuera de la taxonomía', () => {
    expect(() => validateBuyerRequirement({ ...base, mortgageStatus: 'casi' })).toThrow(/hipoteca/)
    expect(() => validateBuyerRequirement({ ...base, mortgageStatus: 'preapproved' })).not.toThrow()
  })
})

describe('BuyerRequirement — ausencia no es negación', () => {
  it('no especificar precio no es pedir precio 0', () => {
    // El contrato del dominio: lo que no se dice queda a null/undefined, y el
    // motor de matching debe poder distinguirlo de un 0 explícito.
    const input: BuyerRequirementInput = { ...base }
    expect(input.priceMax).toBeUndefined()
    expect(() => validateBuyerRequirement(input)).not.toThrow()
  })

  it('un 0 explícito sí es un valor válido y distinto de no decir nada', () => {
    expect(() => validateBuyerRequirement({ ...base, priceMin: 0 })).not.toThrow()
  })
})

describe('BuyerRequirement — resumen legible', () => {
  it('construye el resumen desde los datos estructurados', () => {
    const summary = summarizeRequirement({
      operation: 'sale',
      propertyTypes: ['Apartment', 'Penthouse'],
      desiredZones: [{ label: 'Chamberí' }, { label: 'Salamanca' }],
      priceMax: 650000,
      bedroomsMin: 2,
      criteria: [
        { criterionType: 'terrace', importance: 'required', valueBool: 1 },
        { criterionType: 'elevator', importance: 'preferred', valueBool: 1 },
      ],
    })

    expect(summary).toContain('Compra')
    expect(summary).toContain('Apartment/Penthouse')
    expect(summary).toContain('Chamberí + Salamanca')
    expect(summary).toContain('≥ 2 dorm.')
    expect(summary).toContain('Terraza imprescindible')
    expect(summary).toContain('Ascensor preferible')
    // El precio se formatea como moneda, no como número suelto.
    expect(summary).toMatch(/≤\s*650\.000/)
  })

  it('distingue alquiler de compra', () => {
    expect(summarizeRequirement({ operation: 'rent' })).toContain('Alquiler')
  })

  it('no menciona una característica que se pidió explícitamente NO tener', () => {
    const summary = summarizeRequirement({
      operation: 'sale',
      criteria: [{ criterionType: 'pool', importance: 'required', valueBool: 0 }],
    })
    expect(summary).not.toContain('Piscina')
  })

  it('omite lo que no se ha especificado en vez de inventarlo', () => {
    const summary = summarizeRequirement({ operation: 'sale' })
    expect(summary).toBe('Compra')
  })
})

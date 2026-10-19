import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  ISO_4217_CODES,
  canConvert,
  formatDisplayPrice,
  formatMoney,
  isoCurrencyLabel,
  normalizeIsoCurrency,
  priceFactorsTo,
  propertyCurrency,
} from '../../utils/currency'
import { evaluateMatch, type MatchableRequirement } from '../../server/utils/matching/engine'
import { priceInAgencyCurrencySql } from '../../server/utils/properties/searchService'
import { getPropertySchemaFor, publicFields } from '../../server/utils/propertySchema/registry'
import { adminResources } from '../../server/utils/adminResources'

const read = (f: string) => readFileSync(join(import.meta.dirname, '../..', f), 'utf8')

describe('moneda por propiedad: ISO 4217', () => {
  it('la lista ISO incluye las monedas de la agencia, sin repetidos y en mayúsculas', () => {
    for (const c of CURRENCIES) expect(ISO_4217_CODES).toContain(c.code)
    expect(new Set(ISO_4217_CODES).size).toBe(ISO_4217_CODES.length)
    for (const c of ISO_4217_CODES) expect(c).toMatch(/^[A-Z]{3}$/)
    expect(ISO_4217_CODES.length).toBeGreaterThan(80)
  })
  it('normaliza un código válido y rechaza lo que no es ISO', () => {
    expect(normalizeIsoCurrency('eur')).toBe('EUR')
    expect(normalizeIsoCurrency(' mxn ')).toBe('MXN')
    expect(normalizeIsoCurrency('XXX')).toBeNull()
    expect(normalizeIsoCurrency('')).toBeNull()
    expect(normalizeIsoCurrency(null)).toBeNull()
  })
  it('el nombre sale en castellano con el código', () => {
    expect(isoCurrencyLabel('EUR')).toMatch(/^EUR — Euro/)
    expect(isoCurrencyLabel('MXN')).toMatch(/^MXN — /)
  })
  it('la moneda de una propiedad es la suya o, si no tiene, la de la agencia', () => {
    expect(propertyCurrency({ currency: 'MXN' }, 'EUR')).toBe('MXN')
    expect(propertyCurrency({ currency: null }, 'EUR')).toBe('EUR')
    expect(propertyCurrency({ currency: 'nada' }, 'EUR')).toBe('EUR')
    expect(propertyCurrency(null, 'USD')).toBe('USD')
  })
})

describe('moneda por propiedad: formato', () => {
  it('el servidor y el panel enseñan el importe en la moneda de la propiedad, sin convertir', () => {
    expect(formatMoney(1250000, 'EUR')).toBe('1.250.000 €')
    expect(formatMoney(1250000, 'MXN')).toContain('MXN')
    expect(formatMoney(1250000, 'MXN')).not.toContain('AED')
    expect(formatMoney(50000, 'JPY')).toMatch(/50\.000/)
  })
  it('la web convierte para el visitante sólo si hay tasa; sin tasa enseña la moneda de la propiedad', () => {
    expect(canConvert('EUR', 'USD')).toBe(true)
    expect(canConvert('MXN', 'USD')).toBe(false)
    // Con tasa: igual que siempre.
    expect(formatDisplayPrice(1000, 'EUR', 'EUR')).toBe('1000 €')
    expect(formatDisplayPrice(1000, 'EUR', 'USD')).toContain('$')
    // Sin tasa: se enseña en MXN, no en el USD elegido, y el importe no cambia.
    const sinTasa = formatDisplayPrice(1000000, 'MXN', 'USD')
    expect(sinTasa).toContain('MXN')
    expect(sinTasa).toMatch(/1\.000\.000/)
  })
})

describe('moneda por propiedad: cálculos', () => {
  const req = (over: Partial<MatchableRequirement>): MatchableRequirement => ({ operation: 'sale', ...over }) as MatchableRequirement
  it('un inmueble en otra moneda con tasa se compara convertido con el presupuesto (moneda de la agencia)', () => {
    // 1.000.000 AED ≈ 253.200 €: con presupuesto máximo de 300.000 € cabe, sin convertir (1.000.000 > 300.000) no.
    const r = evaluateMatch({ id: 1, transactionType: 'sale', price: 1000000, currency: 'AED' }, req({ priceMax: 300000 }), { currency: 'EUR' })
    expect(r.criteria.find((c: any) => c.key === 'price')?.outcome).toBe('matched')
    const sinMoneda = evaluateMatch({ id: 1, transactionType: 'sale', price: 1000000 }, req({ priceMax: 300000 }), { currency: 'EUR' })
    expect(sinMoneda.criteria.find((c: any) => c.key === 'price')?.outcome).not.toBe('matched')
  })
  it('un inmueble en una moneda sin tasa no se da por bueno ni por malo', () => {
    const r = evaluateMatch({ id: 1, transactionType: 'sale', price: 5000000, currency: 'MXN' }, req({ priceMax: 300000 }), { currency: 'EUR' })
    const price = r.criteria.find((c: any) => c.key === 'price')
    expect(price?.outcome).toBe('unknown')
    expect(price?.detail).toContain('MXN')
  })
  it('con la moneda de la agencia (o sin moneda) el cálculo es el de siempre', () => {
    const r = evaluateMatch({ id: 1, transactionType: 'sale', price: 250000, currency: 'EUR' }, req({ priceMax: 300000 }), { currency: 'EUR' })
    expect(r.criteria.find((c: any) => c.key === 'price')?.outcome).toBe('matched')
  })
})

describe('moneda por propiedad: filtros y publicación', () => {
  it('las tasas para el filtro de precio salen de la moneda de la agencia y no incluyen la propia', () => {
    const f = priceFactorsTo('EUR')
    expect(f.map((x) => x.code)).not.toContain('EUR')
    expect(f.find((x) => x.code === 'EUR')).toBeUndefined()
    expect(f.find((x) => x.code === 'USD')!.factor).toBeCloseTo(0.9299, 3)
  })
  it('el SQL del filtro sólo convierte las monedas con tasa y deja fuera (NULL) las demás', () => {
    const sql = priceInAgencyCurrencySql({ currency: 'currency', price: 'price' }, 'EUR') as any
    expect(JSON.stringify(sql)).toContain('else null')
  })
  it('la moneda de la propiedad se publica en la ficha pública', () => {
    for (const catalog of ['developer', 'agent'] as const) {
      const keys = publicFields(getPropertySchemaFor(catalog, null))
      expect([...keys]).toContain('currency')
    }
  })
  it('el editor y el servidor aceptan cualquier moneda ISO, no sólo las cinco de la agencia', () => {
    for (const key of ['developer-properties', 'properties'] as const) {
      const f = (adminResources[key] as any).fields.currency
      expect(f.options).toContain('MXN')
      expect(f.options).toContain('EUR')
    }
  })
})

describe('moneda por propiedad: dónde se aplica', () => {
  it('la ficha pública, las tarjetas, el mapa y el panel pasan la moneda de la propiedad', () => {
    expect(read('components/ficha/FichaView.vue')).toContain("provide('propertyCurrency'")
    expect(read('components/ProjectCard.vue')).toContain('project.currency')
    expect(read('components/MapExplorer.client.vue')).toContain('p.currency')
    expect(read('components/admin/AgentPropertyCard.vue')).toContain('currency: props.property.currency')
    expect(read('components/admin/DeveloperPropertyCard.vue')).toContain('currency: props.property.currency')
    expect(read('components/property-list/PropertyList.vue')).toContain('p.currency')
  })
  it('exportaciones, contratos, mensajes, alertas e IA usan la moneda de la propiedad', () => {
    for (const f of ['server/utils/assetExport/bindings.ts', 'server/utils/contracts/bindings.ts', 'server/utils/comms/admin.ts', 'server/tasks/marketing/saved-search-alerts.ts', 'server/utils/ai.ts']) {
      expect(read(f), f).toContain('propertyCurrency(')
    }
  })
})

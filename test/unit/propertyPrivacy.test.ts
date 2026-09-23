import { describe, expect, it } from 'vitest'
import { toPublicProperty, toPublicProperties } from '../../server/utils/propertyPrivacy'

/**
 * migración 0068 (Property Core): `locationPrivacy` decide qué de la
 * ubicación de una property sale en las respuestas públicas, y un grupo fijo
 * de columnas (referencia interna, mandato, fechas de captación…) nunca debe
 * salir sea cual sea el modo. Esto prueba la función en sí, no un endpoint
 * concreto — ver propertyCorePublicDto.test.ts para la comprobación de que
 * los endpoints reales la usan.
 */

function baseRow() {
  return {
    id: 1,
    name: 'Villa Test',
    lat: 25.123456,
    lng: 55.654321,
    streetNumber: '12',
    portal: 'A',
    block: 'B1',
    floor: '3',
    doorLetter: 'D',
    locationPrivacy: 'exact' as string | null,
    locationPrivacyRadius: 500,
    reference: 'W-ABC123',
    externalSource: 'idealista',
    externalReference: 'IDX-9',
    agencyReference: 'AG-1',
    mandateType: 'exclusive',
    exclusiveFrom: '2026-01-01',
    exclusiveUntil: '2026-07-01',
    captureDate: '2025-12-01',
    captureSource: 'referral',
    featuresReviewedAt: '2026-01-05',
    featuresReviewedBy: 7,
  }
}

const INTERNAL_KEYS = [
  'reference',
  'externalSource',
  'externalReference',
  'agencyReference',
  'mandateType',
  'exclusiveFrom',
  'exclusiveUntil',
  'captureDate',
  'captureSource',
  'featuresReviewedAt',
  'featuresReviewedBy',
  'locationPrivacyRadius',
]

describe('toPublicProperty', () => {
  it('siempre elimina las columnas estrictamente internas, en cualquier modo de privacidad', () => {
    for (const mode of ['exact', 'approximate', 'hidden_number']) {
      const out = toPublicProperty({ ...baseRow(), locationPrivacy: mode }) as any
      for (const key of INTERNAL_KEYS) expect(out, `${key} debe faltar en modo ${mode}`).not.toHaveProperty(key)
    }
  })

  it('modo exact: no toca ni coordenadas ni dirección', () => {
    const out = toPublicProperty(baseRow()) as any
    expect(out.lat).toBe(25.123456)
    expect(out.lng).toBe(55.654321)
    expect(out.streetNumber).toBe('12')
    expect(out.portal).toBe('A')
    expect(out.block).toBe('B1')
    expect(out.floor).toBe('3')
    expect(out.doorLetter).toBe('D')
  })

  it('sin locationPrivacy (filas anteriores a la migración 0068): se trata como exact', () => {
    const row = baseRow()
    row.locationPrivacy = null
    const out = toPublicProperty(row) as any
    expect(out.lat).toBe(25.123456)
    expect(out.streetNumber).toBe('12')
  })

  it('modo approximate: redondea coordenadas y borra el número/portal/bloque/planta/letra', () => {
    const out = toPublicProperty({ ...baseRow(), locationPrivacy: 'approximate' }) as any
    expect(out.lat).toBe(25.123)
    expect(out.lng).toBe(55.654)
    expect(out.streetNumber).toBeNull()
    expect(out.portal).toBeNull()
    expect(out.block).toBeNull()
    expect(out.floor).toBeNull()
    expect(out.doorLetter).toBeNull()
  })

  it('modo approximate: nunca cae a (0,0) — unas coordenadas ausentes siguen ausentes', () => {
    const out = toPublicProperty({ ...baseRow(), locationPrivacy: 'approximate', lat: null, lng: null }) as any
    expect(out.lat).toBeNull()
    expect(out.lng).toBeNull()
  })

  it('modo hidden_number: coordenadas exactas, pero sin número/portal/bloque/planta/letra', () => {
    const out = toPublicProperty({ ...baseRow(), locationPrivacy: 'hidden_number' }) as any
    expect(out.lat).toBe(25.123456)
    expect(out.lng).toBe(55.654321)
    expect(out.streetNumber).toBeNull()
    expect(out.portal).toBeNull()
  })

  it('no muta la fila original', () => {
    const row = baseRow()
    row.locationPrivacy = 'approximate'
    const original = JSON.stringify(row)
    toPublicProperty(row)
    expect(JSON.stringify(row)).toBe(original)
  })
})

describe('toPublicProperties', () => {
  it('aplica la redacción a cada fila de la lista', () => {
    const rows = [baseRow(), { ...baseRow(), id: 2, locationPrivacy: 'approximate' }]
    const out = toPublicProperties(rows) as any[]
    expect(out).toHaveLength(2)
    expect(out[0]).not.toHaveProperty('reference')
    expect(out[1].lat).toBe(25.123)
  })
})

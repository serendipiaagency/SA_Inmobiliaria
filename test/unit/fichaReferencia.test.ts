import { describe, expect, it } from 'vitest'
import { toPublicProperty } from '../../server/utils/propertyPrivacy'
import { publicReferenceLabel } from '../../server/utils/properties/publicDetail'
import { fichaSectionHasData } from '../../utils/fichaVisibility'

/**
 * Cola 3 y 4 de la ficha pública: la referencia del anuncio («REF: …») la
 * calcula el servidor (`referenceLabel`: referencia de agencia, si no el
 * código comercial, si no la referencia propia; todas las propiedades
 * enseñan una) y `project` sigue sin traer las columnas de referencia; y
 * «Análisis de inversión» no se pinta cuando el servidor sabe que no hay
 * comparables (`availability.analysis === false`), aunque la propiedad tenga
 * precio y superficie.
 */

function row(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Residencial Prueba',
    price: 250000,
    area: 80,
    locationPrivacy: 'exact' as string | null,
    locationPrivacyRadius: null as number | null,
    reference: 'W-ABC123',
    externalSource: 'idealista',
    externalReference: 'IDX-9',
    agencyReference: 'AG-77',
    mandateType: 'exclusive',
    captureDate: '2025-12-01',
    ...over,
  }
}

describe('publicReferenceLabel: agencia > código comercial > referencia propia', () => {
  it('la referencia de agencia manda', () => {
    expect(publicReferenceLabel(row(), { commercialCode: 'CC-9' })).toBe('AG-77')
  })

  it('sin referencia de agencia, el código comercial de la ficha ampliada', () => {
    expect(publicReferenceLabel(row({ agencyReference: null }), { commercialCode: 'CC-9' })).toBe('CC-9')
    expect(publicReferenceLabel(row({ agencyReference: '' }), { commercialCode: ' CC-9 ' })).toBe('CC-9')
  })

  it('sin ninguna de las dos, la referencia propia de la propiedad', () => {
    expect(publicReferenceLabel(row({ agencyReference: null }), {})).toBe('W-ABC123')
    expect(publicReferenceLabel(row({ agencyReference: null }), null)).toBe('W-ABC123')
    expect(publicReferenceLabel(row({ agencyReference: null }), { commercialCode: '' })).toBe('W-ABC123')
  })

  it('vacía si no hay ninguna (filas sin referencia); nunca el id ni la referencia de portales', () => {
    const label = publicReferenceLabel(row({ agencyReference: null, reference: null }), {})
    expect(label).toBe('')
    expect(label).not.toContain('IDX-9')
    expect(label).not.toContain('7')
  })
})

describe('toPublicProperty: sólo sale la etiqueta calculada; las columnas de referencia siguen internas', () => {
  it('quita reference, agencyReference y externalReference en ambos catálogos', () => {
    for (const catalog of ['developer', 'agent'] as const) {
      const out = toPublicProperty(row(), { catalog }) as any
      expect(out, catalog).not.toHaveProperty('reference')
      expect(out, catalog).not.toHaveProperty('agencyReference')
      expect(out, catalog).not.toHaveProperty('externalReference')
      expect(out, catalog).not.toHaveProperty('externalSource')
      expect(out, catalog).not.toHaveProperty('mandateType')
      expect(out, catalog).not.toHaveProperty('captureDate')
      expect(JSON.stringify(out), catalog).not.toContain('AG-77')
    }
  })
})

describe('fichaSectionHasData(analisis): sin comparables no hay análisis', () => {
  const project = { price: 250000, area: 80 }

  it('es falso con availability.analysis === false aunque haya precio y superficie', () => {
    expect(fichaSectionHasData('analisis', { project, availability: { analysis: false } })).toBe(false)
    expect(fichaSectionHasData('analisis', { project, availability: { score: true, similar: true, analysis: false } })).toBe(false)
  })

  it('es verdadero si el servidor dice que hay comparables o si no se sabe', () => {
    expect(fichaSectionHasData('analisis', { project, availability: { analysis: true } })).toBe(true)
    expect(fichaSectionHasData('analisis', { project, availability: {} })).toBe(true)
    expect(fichaSectionHasData('analisis', { project, availability: null })).toBe(true)
    expect(fichaSectionHasData('analisis', { project })).toBe(true)
  })

  it('sigue exigiendo precio y superficie, con comparables o sin saberlo', () => {
    expect(fichaSectionHasData('analisis', { project: { price: 250000, area: 0 }, availability: { analysis: true } })).toBe(false)
    expect(fichaSectionHasData('analisis', { project: { price: 0, area: 80 } })).toBe(false)
  })

  it('lo que el navegador descubre al cargar (emptyAtRuntime) también la quita', () => {
    expect(fichaSectionHasData('analisis', { project, availability: { analysis: true }, emptyAtRuntime: new Set(['analisis']) })).toBe(false)
  })
})

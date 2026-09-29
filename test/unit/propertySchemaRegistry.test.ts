import { describe, expect, it } from 'vitest'
import {
  AGENT_PROPERTY_TYPE_TO_SCHEMA,
  getPropertySchema,
  getPropertySchemaFor,
  getPortalRelevantFields,
  getPublicExposableFields,
  isFieldApplicable,
  listPropertySchemas,
  PROPERTY_SCHEMAS,
  validateAgainstSchema,
  type PropertySchemaKey,
} from '../../server/utils/propertySchema/registry'

/**
 * FASE 26 — PropertySchemaRegistry.
 *
 * Registro declarativo puro (sin DB, sin Property real) — estas pruebas son
 * de integridad estructural (cada schema es coherente consigo mismo) y de
 * las dos funciones que de verdad importan en producción: a qué schema
 * mapea un propertyType/catálogo, y qué falta para guardar/publicar.
 */

const SCHEMA_KEYS: PropertySchemaKey[] = ['residential', 'land', 'commercial', 'industrial', 'garage', 'building', 'newDevelopment']

describe('PropertySchemaRegistry — integridad estructural', () => {
  it('expone exactamente los 7 schemas del encargo (§34)', () => {
    expect(Object.keys(PROPERTY_SCHEMAS).sort()).toEqual([...SCHEMA_KEYS].sort())
    expect(listPropertySchemas()).toHaveLength(7)
  })

  it.each(SCHEMA_KEYS)('%s: toda sección referencia sólo campos declarados en fields (sin huérfanos)', (key) => {
    const schema = getPropertySchema(key)
    const declared = new Set(Object.keys(schema.fields))
    for (const section of schema.sections) {
      for (const fieldKey of section.fields) {
        expect(declared.has(fieldKey), `${key}.${section.key} referencia '${fieldKey}', no declarado en fields`).toBe(true)
      }
    }
  })

  it.each(SCHEMA_KEYS)('%s: todo campo declarado en fields pertenece a alguna sección (sin campos huérfanos por el otro lado)', (key) => {
    const schema = getPropertySchema(key)
    const sectioned = new Set(schema.sections.flatMap((s) => s.fields))
    for (const fieldKey of Object.keys(schema.fields)) {
      expect(sectioned.has(fieldKey), `${key}: campo '${fieldKey}' no aparece en ninguna sección`).toBe(true)
    }
  })

  it('residential/land/commercial/industrial/garage/building son de catálogo agent; newDevelopment es developer', () => {
    for (const key of SCHEMA_KEYS) {
      const schema = getPropertySchema(key)
      if (key === 'newDevelopment') expect(schema.catalogs).toEqual(['developer'])
      else expect(schema.catalogs).toEqual(['agent'])
    }
  })

  it('Land no tiene bedrooms/bathrooms (§157 — no mostrar campos absurdos)', () => {
    const land = getPropertySchema('land')
    expect(isFieldApplicable(land, 'bedrooms')).toBe(false)
    expect(isFieldApplicable(land, 'bathrooms')).toBe(false)
  })

  it('Garage no tiene bedrooms/kitchens (§158)', () => {
    const garage = getPropertySchema('garage')
    expect(isFieldApplicable(garage, 'bedrooms')).toBe(false)
    expect(isFieldApplicable(garage, 'kitchens')).toBe(false)
    expect(isFieldApplicable(garage, 'garageSpaces')).toBe(true)
  })

  it('los campos internos (propertyPrivacy.ts INTERNAL_ONLY_KEYS) nunca son publicExposable', () => {
    const internalKeys = ['reference', 'externalSource', 'externalReference', 'agencyReference', 'mandateType', 'exclusiveFrom', 'exclusiveUntil', 'captureDate', 'captureSource', 'locationPrivacyRadius']
    for (const key of SCHEMA_KEYS) {
      const schema = getPropertySchema(key)
      for (const internalKey of internalKeys) {
        const rule = schema.fields[internalKey]
        if (rule) expect(rule.publicExposable, `${key}.${internalKey} no debería ser publicExposable`).toBe(false)
      }
    }
  })
})

describe('getPropertySchemaFor — PropertyType → PropertySchema (§35)', () => {
  it('catalog developer siempre resuelve a newDevelopment, sea cual sea propertyType', () => {
    expect(getPropertySchemaFor('developer', 'Apartment').key).toBe('newDevelopment')
    expect(getPropertySchemaFor('developer', null).key).toBe('newDevelopment')
    expect(getPropertySchemaFor('developer', 'algo-desconocido').key).toBe('newDevelopment')
  })

  it('catalog agent mapea los 5 tipos residenciales existentes a residential', () => {
    for (const type of ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']) {
      expect(getPropertySchemaFor('agent', type).key).toBe('residential')
    }
  })

  it('catalog agent mapea los nuevos tipos a su schema correspondiente', () => {
    expect(getPropertySchemaFor('agent', 'Land').key).toBe('land')
    expect(getPropertySchemaFor('agent', 'Office').key).toBe('commercial')
    expect(getPropertySchemaFor('agent', 'Retail').key).toBe('commercial')
    expect(getPropertySchemaFor('agent', 'Warehouse').key).toBe('industrial')
    expect(getPropertySchemaFor('agent', 'Garage').key).toBe('garage')
    expect(getPropertySchemaFor('agent', 'Building').key).toBe('building')
  })

  it('catalog agent con propertyType null/desconocido cae a residential (default seguro, no revienta)', () => {
    expect(getPropertySchemaFor('agent', null).key).toBe('residential')
    expect(getPropertySchemaFor('agent', 'tipo-inventado').key).toBe('residential')
  })

  it('AGENT_PROPERTY_TYPE_TO_SCHEMA sólo mapea a claves de schema reales', () => {
    for (const schemaKey of Object.values(AGENT_PROPERTY_TYPE_TO_SCHEMA)) {
      expect(SCHEMA_KEYS).toContain(schemaKey)
    }
  })
})

describe('validateAgainstSchema — §21 (borrador vs publicación)', () => {
  it('modo save: una Property residencial totalmente vacía ya es válida — hoy `properties` no tiene ningún campo required (auditoría FASE 26), y el registro no debe introducir una restricción nueva que bloquee guardar un borrador', () => {
    const schema = getPropertySchema('residential')
    const result = validateAgainstSchema(schema, {}, 'save')
    expect(result.ok).toBe(true)
    expect(result.missingForSave).toEqual([])
  })

  it('modo publish: exige además los requiredForPublish (city, area...) aunque save ya pasara', () => {
    const schema = getPropertySchema('residential')
    const result = validateAgainstSchema(schema, { transactionType: 'sale', price: 200000 }, 'publish')
    expect(result.ok).toBe(false)
    expect(result.missingForPublish.length).toBeGreaterThan(0)
    expect(result.missingForSave).toEqual([])
  })

  it('modo publish: con todos los requiredForPublish presentes, ok=true', () => {
    const schema = getPropertySchema('residential')
    const result = validateAgainstSchema(
      schema,
      { transactionType: 'sale', price: 200000, city: 'Madrid', country: 'España', area: 90, bedrooms: 3, bathrooms: 2 },
      'publish',
    )
    expect(result.ok).toBe(true)
  })

  it('newDevelopment exige name (no propertyType, no aplica en ese catálogo)', () => {
    const schema = getPropertySchema('newDevelopment')
    const result = validateAgainstSchema(schema, { transactionType: 'sale' }, 'save')
    expect(result.missingForSave).toContain('name')
  })

  it('0 no se trata como "vacío" (distinto de null/undefined/"") — un precio real de 0 no debería marcarse como campo requerido faltante', () => {
    const schema = getPropertySchema('residential')
    const result = validateAgainstSchema(
      schema,
      { transactionType: 'sale', price: 0, city: 'Madrid', country: 'España', area: 90, bedrooms: 3, bathrooms: 2 },
      'publish',
    )
    expect(result.missingForPublish).not.toContain('price')
  })
})

describe('getPublicExposableFields / getPortalRelevantFields', () => {
  it('nunca incluyen los campos internos aunque estén declarados en el schema', () => {
    for (const key of SCHEMA_KEYS) {
      const schema = getPropertySchema(key)
      const publicFields = getPublicExposableFields(schema)
      expect(publicFields).not.toContain('reference')
      expect(publicFields).not.toContain('captureSource')
      expect(publicFields).not.toContain('organizationId')
    }
  })

  it('residential expone price/area/bedrooms/bathrooms públicamente', () => {
    const schema = getPropertySchema('residential')
    const publicFields = getPublicExposableFields(schema)
    for (const key of ['price', 'area', 'bedrooms', 'bathrooms', 'city']) expect(publicFields).toContain(key)
  })

  it('portalRelevant es un subconjunto razonable — nunca incluye developerId/organizationId', () => {
    for (const key of SCHEMA_KEYS) {
      const schema = getPropertySchema(key)
      const portalFields = getPortalRelevantFields(schema)
      expect(portalFields).not.toContain('developerId')
      expect(portalFields).not.toContain('organizationId')
    }
  })
})

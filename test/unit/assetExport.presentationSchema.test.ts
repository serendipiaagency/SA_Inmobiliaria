import { describe, expect, it } from 'vitest'
import { preferredFieldsFor, resolveAssetCategory } from '../../server/utils/assetExport/presentationSchema'

describe('resolveAssetCategory', () => {
  it('recognizes real developer_properties propertyType values as vivienda', () => {
    for (const t of ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio']) {
      expect(resolveAssetCategory(t)).toBe('vivienda')
    }
  })

  it('recognizes Spanish free-text propertyType values from agent_properties', () => {
    expect(resolveAssetCategory('Piso')).toBe('vivienda')
    expect(resolveAssetCategory('Chalet adosado')).toBe('vivienda')
    expect(resolveAssetCategory('Terreno urbano')).toBe('terreno')
    expect(resolveAssetCategory('Nave industrial')).toBe('nave')
    expect(resolveAssetCategory('Local comercial en esquina')).toBe('local')
    expect(resolveAssetCategory('Garaje individual')).toBe('garaje')
    expect(resolveAssetCategory('Promoción de obra nueva')).toBe('promocion')
  })

  it('falls back to generic for null/empty/unrecognized input instead of guessing', () => {
    expect(resolveAssetCategory(null)).toBe('generic')
    expect(resolveAssetCategory(undefined)).toBe('generic')
    expect(resolveAssetCategory('')).toBe('generic')
    expect(resolveAssetCategory('Something totally made up')).toBe('generic')
  })
})

describe('preferredFieldsFor', () => {
  it('only returns fields backed by real developer_properties/agent_properties columns', () => {
    const REAL_COLUMNS = ['bedrooms', 'bathrooms', 'area', 'hasTerrace', 'hasGarage', 'hasPool', 'price', 'community', 'description', 'yearBuilt']
    for (const category of ['vivienda', 'terreno', 'local', 'nave', 'garaje', 'promocion', 'generic'] as const) {
      for (const field of preferredFieldsFor(category)) {
        expect(REAL_COLUMNS).toContain(field.key)
      }
    }
  })

  it('vivienda prioritizes housing-specific fields', () => {
    const keys = preferredFieldsFor('vivienda').map((f) => f.key)
    expect(keys).toContain('bedrooms')
    expect(keys).toContain('bathrooms')
  })

  it('categories without dedicated columns (terreno/local/nave/garaje) fall back to the generic field set', () => {
    const generic = preferredFieldsFor('generic').map((f) => f.key)
    for (const category of ['terreno', 'local', 'nave', 'garaje'] as const) {
      expect(preferredFieldsFor(category).map((f) => f.key)).toEqual(generic)
    }
  })
})

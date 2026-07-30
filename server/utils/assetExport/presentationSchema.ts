// Asset Presentation Schema (Fase 7): centralizes which fields a template
// shows *preferentially* for a given asset category, in one place, instead
// of "if propertyType === X" checks scattered across templates/editor/UI.
//
// Honesty constraint: this can only reference fields that actually exist on
// developer_properties / agent_properties (see server/db/schema.ts). The
// original spec's per-category field lists (edificabilidad, fachada, altura
// libre, muelles, licencia, número de unidades…) assume dedicated columns
// that this schema does not have today — those categories fall back to the
// generic real-estate fields that do exist (area, price, community,
// description) rather than inventing data the DB can't back. Adding
// first-class columns for land/commercial/industrial specifics is a
// separate, larger schema migration — not something to fake here.
export type AssetCategory = 'vivienda' | 'terreno' | 'local' | 'nave' | 'garaje' | 'promocion' | 'generic'

export interface PresentationField {
  key: string
  label: string
}

const HOUSING_FIELDS: PresentationField[] = [
  { key: 'bedrooms', label: 'Habitaciones' },
  { key: 'bathrooms', label: 'Baños' },
  { key: 'area', label: 'Superficie' },
  { key: 'hasTerrace', label: 'Terraza' },
  { key: 'hasGarage', label: 'Garaje' },
  { key: 'hasPool', label: 'Piscina' },
]

const GENERIC_FIELDS: PresentationField[] = [
  { key: 'area', label: 'Superficie' },
  { key: 'price', label: 'Precio' },
  { key: 'community', label: 'Zona' },
  { key: 'description', label: 'Descripción' },
]

const DEVELOPMENT_FIELDS: PresentationField[] = [
  { key: 'area', label: 'Superficie' },
  { key: 'price', label: 'Precio desde' },
  { key: 'yearBuilt', label: 'Entrega estimada' },
  { key: 'community', label: 'Zona' },
]

// Matches a raw propertyType string (free text on agent_properties, one of
// Apartment|Villa|Townhouse|Penthouse|Studio on developer_properties) to a
// category. Falls back to 'generic' for anything unrecognized instead of
// guessing — an unmapped type still gets a sensible field list, just not a
// category-specific one.
const CATEGORY_KEYWORDS: Array<[AssetCategory, RegExp]> = [
  ['vivienda', /apartment|villa|townhouse|penthouse|studio|piso|casa|chalet|d[uú]plex|[aá]tico/i],
  ['terreno', /terreno|solar|parcela|finca|plot|land/i],
  ['nave', /nave|industrial|almac[eé]n|warehouse/i],
  ['local', /local|oficina|office|comercial|retail/i],
  ['garaje', /garaje|trastero|parking|garage/i],
  ['promocion', /promoci[oó]n|development|obra nueva/i],
]

export function resolveAssetCategory(propertyType: string | null | undefined): AssetCategory {
  if (!propertyType) return 'generic'
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(propertyType)) return category
  }
  return 'generic'
}

export function preferredFieldsFor(category: AssetCategory): PresentationField[] {
  switch (category) {
    case 'vivienda':
      return HOUSING_FIELDS
    case 'promocion':
      return DEVELOPMENT_FIELDS
    case 'terreno':
    case 'local':
    case 'nave':
    case 'garaje':
    case 'generic':
    default:
      return GENERIC_FIELDS
  }
}

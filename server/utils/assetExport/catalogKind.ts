/**
 * De qué catálogo de propiedades es un catálogo combinado (FASE 28, «Crear
 * catálogo» en los dos catálogos): obra nueva (`developer_properties`, lo de
 * siempre) o 2ª mano (`agent_properties`).
 *
 * `asset_export_catalogs` no tiene columna para esto y no se añade (sin
 * migraciones): se guarda en su `validation_json` como `{ "propertyKind":
 * "agent" }` al crearlo, y el ensamblado final lo conserva al escribir ahí su
 * validación (`withCatalogKind`). Sin la marca —todos los catálogos de antes—
 * es obra nueva, que es lo único que existía.
 */

export type CatalogPropertyKind = 'developer' | 'agent'

/** El `assetKind` de Asset Export (`resolveAssetBindings`) de cada catálogo. */
export const CATALOG_ASSET_KIND: Record<CatalogPropertyKind, 'developer_property' | 'agent_property'> = {
  developer: 'developer_property',
  agent: 'agent_property',
}

export const CATALOG_KIND_LABELS: Record<CatalogPropertyKind, string> = {
  developer: 'Obra nueva',
  agent: '2ª mano',
}

export function parseCatalogPropertyKind(value: unknown): CatalogPropertyKind | null {
  if (value === undefined || value === null || value === '' || value === 'developer') return 'developer'
  if (value === 'agent') return 'agent'
  return null
}

/** El catálogo de propiedades de un catálogo combinado, leído de su `validation_json`. */
export function catalogPropertyKind(catalog: { validationJson?: string | null }): CatalogPropertyKind {
  if (!catalog.validationJson) return 'developer'
  try {
    return JSON.parse(catalog.validationJson)?.propertyKind === 'agent' ? 'agent' : 'developer'
  } catch {
    return 'developer'
  }
}

/** `validation_json` con la marca del catálogo de propiedades (sólo se escribe para 2ª mano: obra nueva es el valor por defecto). */
export function withCatalogKind(validation: Record<string, unknown> | null, kind: CatalogPropertyKind): string | null {
  if (kind === 'developer') return validation ? JSON.stringify(validation) : null
  return JSON.stringify({ ...(validation || {}), propertyKind: kind })
}

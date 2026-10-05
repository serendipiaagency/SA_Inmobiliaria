import { getPropertySchemaFor, projectWithFields, publicFields, type PropertyCatalog } from './propertySchema/registry'

/**
 * Qué de una Property (developer_properties / agent_properties) puede salir
 * en una respuesta pública.
 *
 * Desde el bloque N7a (FASE 26) la proyección la decide el
 * PropertySchemaRegistry (`server/utils/propertySchema/registry.ts`): de los
 * campos que el registro declara para el catálogo, sólo salen los
 * `publicFields` del esquema que resuelve la fila (por catálogo y tipo). Lo
 * interno —referencias, mandato, exclusividad, captación, privacidad de
 * ubicación, promotora, oficina, equipo, legal, comisiones, precio mínimo…—
 * no llega nunca a una respuesta pública, y lo que el registro marca como
 * no aplicable al tipo tampoco.
 *
 * Lo que el registro no modela (id, slug, fotos, fechas de la fila, nombre de
 * la promotora que añade el endpoint…) es estructura de la fila y sigue
 * pasando: reescribir esos endpoints a una lista blanca columna a columna
 * rompería páginas públicas ya probadas (MapExplorer, PropertiesBlock…). Lo
 * que sí se garantiza siempre:
 *  - las columnas de `INTERNAL_ONLY_KEYS` (las del registro y las de gestión
 *    que el registro no modela, como quién repasó las características o la
 *    papelera) se eliminan siempre;
 *  - una ubicación marcada como no exacta no filtra coordenadas ni el número.
 */

export interface PropertyLocationPrivacyFields {
  lat?: number | null
  lng?: number | null
  streetNumber?: string | null
  portal?: string | null
  block?: string | null
  floor?: string | null
  doorLetter?: string | null
  locationPrivacy?: string | null
  locationPrivacyRadius?: number | null
}

/**
 * Columnas estrictamente internas — nunca públicas, sea cual sea el modo de
 * privacidad de ubicación y aunque el registro cambiara. Red de seguridad por
 * encima de la proyección del registro.
 */
const INTERNAL_ONLY_KEYS = [
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
  // Migración 0086: quién dio de alta la ficha (users.id) y el borrado lógico.
  'createdBy',
  'deletedAt',
] as const

export interface PublicProjectionOptions {
  /** Catálogo de la fila. Las respuestas públicas de hoy son de obra nueva (`developer`), que es el valor por defecto. */
  catalog?: PropertyCatalog
}

/**
 * Redondea a ~111 m de resolución (3 decimales) — suficiente para situar el
 * barrio sin delatar el portal exacto. Truncar en vez de aplicar un jitter
 * aleatorio: determinista, fácil de razonar y de testear, y no hay radio de
 * verdad configurado más que como referencia visual futura del picker.
 */
function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000
}

/**
 * Devuelve una COPIA del objeto (nunca muta el original — el mismo `project`
 * puede usarse también para lógica interna en el mismo request) con:
 *  - las columnas estrictamente internas eliminadas siempre;
 *  - lat/lng y el número de la dirección redactados según `locationPrivacy`.
 *
 * `approximate`: coordenadas redondeadas + sin número/portal/bloque/planta/
 * letra. `hidden_number`: coordenadas exactas, pero sin número/portal/
 * bloque/planta/letra. `exact` (o ausente, por compatibilidad con filas de
 * antes de esta migración): sin cambios.
 */
export function toPublicProperty<T extends PropertyLocationPrivacyFields>(row: T, opts: PublicProjectionOptions = {}): Omit<T, (typeof INTERNAL_ONLY_KEYS)[number]> {
  const catalog = opts.catalog ?? 'developer'
  const schema = getPropertySchemaFor(catalog, (row as { propertyType?: string | null }).propertyType ?? null)
  const out: any = projectWithFields(row as Record<string, any>, catalog, publicFields(schema))
  for (const key of INTERNAL_ONLY_KEYS) Reflect.deleteProperty(out, key)

  return redactLocation(out, row.locationPrivacy)
}

/**
 * La redacción de la ubicación según `locationPrivacy`, sobre un objeto que ya
 * es una copia. La comparten la web pública y lo que se entrega a un portal
 * (server/utils/publication/listing.ts).
 */
export function redactLocation<T extends Record<string, any>>(out: T, locationPrivacy: string | null | undefined): T {
  const privacy = locationPrivacy || 'exact'
  if (privacy === 'exact') return out
  const o: Record<string, any> = out

  // approximate y hidden_number comparten la redacción de dirección exacta.
  o.streetNumber = null
  o.portal = null
  o.block = null
  o.floor = null
  o.doorLetter = null
  if ('staircase' in o) o.staircase = null

  if (privacy === 'approximate') {
    if (typeof o.lat === 'number') o.lat = roundCoord(o.lat)
    if (typeof o.lng === 'number') o.lng = roundCoord(o.lng)
  }

  return out
}

/** Aplica toPublicProperty() a cada fila de una lista — para los endpoints de listado (home, búsqueda). */
export function toPublicProperties<T extends PropertyLocationPrivacyFields>(rows: T[], opts: PublicProjectionOptions = {}): Omit<T, (typeof INTERNAL_ONLY_KEYS)[number]>[] {
  return rows.map((row) => toPublicProperty(row, opts))
}

/**
 * La ficha ampliada (property_details / property_legal_economics) en una
 * respuesta pública: SÓLO los `publicFields` del esquema y sólo con valor —
 * aquí no pasa nada que el registro no declare (`onlyDeclared`). Lo legal,
 * las comisiones, el precio mínimo, la oficina y el equipo se quedan fuera.
 */
export function toPublicSheet(sheet: Record<string, unknown>, catalog: PropertyCatalog, propertyType: string | null | undefined): Record<string, unknown> {
  const schema = getPropertySchemaFor(catalog, propertyType ?? null)
  const projected = projectWithFields(sheet, catalog, publicFields(schema), { onlyDeclared: true }) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(projected)) if (v !== null && v !== undefined && v !== '') out[k] = v
  // La escalera es parte de la dirección exacta: el registro ya la marca interna.
  return out
}

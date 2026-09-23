/**
 * Qué de una Property (developer_properties / agent_properties) puede salir
 * en una respuesta pública, según su `locationPrivacy` (migración 0068:
 * exact | approximate | hidden_number) y un pequeño grupo de columnas que
 * son estrictamente internas por definición (megaprompt FASE 1: "NO debe
 * aparecer accidentalmente en HTML público; JSON público; metadata;
 * bindings; feeds").
 *
 * Deliberadamente NO es una reescritura completa de los DTOs públicos a
 * whitelist de columnas — server/api/public/home.get.ts,
 * properties.get.ts y properties/[slug].get.ts siguen haciendo `select()`
 * completo, un patrón ya existente antes de esta fase y consumido tal cual
 * por MapExplorer/PropertiesBlock/MapTeaserBlock/etc. en todo el sitio
 * público. Reescribir eso a una proyección explícita es un cambio real y
 * de alcance mayor (la FASE 27 "Property Search" ya lo prevé) que arriesga
 * romper páginas públicas ya probadas sin la auditoría específica que eso
 * merece. Lo que SÍ es responsabilidad de esta fase — y lo que hace esta
 * función — es asegurar que los campos NUEVOS que introduce (privacidad de
 * ubicación, referencias internas, mandato, exclusividad, fechas de
 * captación) nunca lleguen a una respuesta pública, y que una ubicación
 * marcada como no-exacta no filtre coordenadas/dirección precisas.
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

/** Columnas nuevas de la FASE 1 que son estrictamente internas — nunca públicas, sea cual sea el modo de privacidad de ubicación. */
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
] as const

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
export function toPublicProperty<T extends PropertyLocationPrivacyFields>(row: T): Omit<T, (typeof INTERNAL_ONLY_KEYS)[number]> {
  const out: any = { ...row }
  for (const key of INTERNAL_ONLY_KEYS) Reflect.deleteProperty(out, key)

  const privacy = row.locationPrivacy || 'exact'
  if (privacy === 'exact') return out

  // approximate y hidden_number comparten la redacción de dirección exacta.
  out.streetNumber = null
  out.portal = null
  out.block = null
  out.floor = null
  out.doorLetter = null

  if (privacy === 'approximate') {
    if (typeof out.lat === 'number') out.lat = roundCoord(out.lat)
    if (typeof out.lng === 'number') out.lng = roundCoord(out.lng)
  }

  return out
}

/** Aplica toPublicProperty() a cada fila de una lista — para los endpoints de listado (home, búsqueda). */
export function toPublicProperties<T extends PropertyLocationPrivacyFields>(rows: T[]): Omit<T, (typeof INTERNAL_ONLY_KEYS)[number]>[] {
  return rows.map(toPublicProperty)
}

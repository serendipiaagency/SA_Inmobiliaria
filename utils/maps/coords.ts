/**
 * Validación de coordenadas compartida por todo el sistema de mapas (admin,
 * público y servidor). Sin dependencias de Leaflet/navegador a propósito:
 * se puede importar tanto desde un `.client.vue` como desde un endpoint de
 * `server/api/`.
 *
 * Antes de esto, varios sitios comprobaban `lat && lng` (verdad de
 * JavaScript), que descarta en silencio una propiedad real situada
 * exactamente en el ecuador o en el meridiano de Greenwich (`0` es falsy).
 * El par EXACTO `(0,0)` sí se trata como "sin ubicación": en un portal
 * centrado en España/Dubái nunca es una dirección real, siempre es un dato
 * por defecto sin rellenar — de ahí que la corrección no sea sólo "usar
 * `typeof`" sino además seguir excluyendo ese caso concreto, a propósito y
 * con nombre, en vez de dejar que cuele como una ubicación válida.
 */

export function isFiniteCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export interface MaybeCoords {
  lat?: unknown
  lng?: unknown
}

export function hasValidCoords<T extends MaybeCoords>(item: T): item is T & { lat: number; lng: number } {
  return isFiniteCoord(item.lat) && isFiniteCoord(item.lng) && !(item.lat === 0 && item.lng === 0)
}

/** Filtra y estrecha el tipo en un solo paso: sólo lo que pasa `hasValidCoords`. */
export function withValidCoords<T extends MaybeCoords>(items: T[]): (T & { lat: number; lng: number })[] {
  return items.filter(hasValidCoords)
}

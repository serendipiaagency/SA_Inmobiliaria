/**
 * Estancias de una foto de la galería (Cola 5, migración 0097): el catálogo
 * canónico con el que se clasifican las fotos desde el panel y por el que la
 * ficha pública filtra dentro de «Todas las fotos». Compartido por el
 * servidor (validación), el gestor de galería y la web.
 *
 * No reutiliza las «Estancias» de Property Core (`developer_property_rooms`):
 * allí el tipo es texto libre y describe la distribución de la vivienda, no
 * una foto. Una foto sin estancia (NULL) no se clasifica sola: sigue en
 * «Todas las fotos» y nada se infiere del nombre del archivo.
 */
export const MEDIA_ROOMS = [
  'living',
  'kitchen',
  'dining',
  'bedroom',
  'bathroom',
  'office',
  'hall',
  'laundry',
  'terrace',
  'balcony',
  'garden',
  'pool',
  'exterior',
  'facade',
  'views',
  'garage',
  'storage',
  'common',
  'other',
] as const
export type MediaRoom = (typeof MEDIA_ROOMS)[number]

/** Etiquetas del panel (la web usa i18n: `gallery.room.<clave>`). */
export const MEDIA_ROOM_LABELS: Record<MediaRoom, string> = {
  living: 'Salón',
  kitchen: 'Cocina',
  dining: 'Comedor',
  bedroom: 'Dormitorio',
  bathroom: 'Baño',
  office: 'Despacho',
  hall: 'Recibidor y pasillos',
  laundry: 'Lavadero',
  terrace: 'Terraza',
  balcony: 'Balcón',
  garden: 'Jardín',
  pool: 'Piscina',
  exterior: 'Exterior',
  facade: 'Fachada',
  views: 'Vistas',
  garage: 'Garaje',
  storage: 'Trastero',
  common: 'Zonas comunes',
  other: 'Otros',
}

/** Icono (utils/mediaGalleryIcons.ts) de cada estancia. */
export const MEDIA_ROOM_ICON: Record<MediaRoom, string> = Object.fromEntries(MEDIA_ROOMS.map((r) => [r, r])) as Record<MediaRoom, string>

export function isMediaRoom(value: unknown): value is MediaRoom {
  return typeof value === 'string' && (MEDIA_ROOMS as readonly string[]).includes(value)
}

/** Lo que admite el panel al clasificar: una estancia del catálogo o nada (sin clasificar). */
export function normalizeMediaRoom(value: unknown): MediaRoom | null {
  if (value === null || value === undefined || value === '') return null
  return isMediaRoom(value) ? value : null
}

/**
 * Catálogos de multimedia y documentos de una propiedad (FASES 6 y 7, bloque
 * N7a), compartidos por el panel y el servidor — un solo sitio para las
 * claves, sus etiquetas en castellano y las reglas puras (nivel de acceso de
 * una visibilidad, estado de caducidad) que se usan a los dos lados.
 *
 * Los tipos de documento y las visibilidades viven en `utils/propertySheet.ts`
 * (los creó la migración 0086 junto a la ficha ampliada); aquí sólo se
 * añade lo que necesita el gestor.
 */

/** Tipos de recurso de `property_media` (migración 0086). Fotos y planos siguen en sus tablas. */
export const PROPERTY_MEDIA_TYPES = ['video', 'virtual_tour', 'render', 'pdf', 'drone', 'pano360', 'other'] as const
export type PropertyMediaType = (typeof PROPERTY_MEDIA_TYPES)[number]

export const PROPERTY_MEDIA_TYPE_LABELS: Record<string, string> = {
  video: 'Vídeo',
  virtual_tour: 'Tour virtual',
  render: 'Render / infografía',
  pdf: 'PDF (folleto, memoria de calidades…)',
  drone: 'Foto aérea (drone)',
  pano360: 'Foto 360°',
  other: 'Otro',
}

/**
 * Qué fuente admite cada tipo:
 *  - `url`: un enlace `https://` (YouTube, Vimeo, Matterport, Kuula…);
 *  - `image`: una imagen subida a la agencia (JPG, PNG, WebP o GIF);
 *  - `pdf`: un PDF subido a la agencia;
 *  - `video`: un vídeo subido (MP4/WebM, subida por partes).
 */
export const PROPERTY_MEDIA_SOURCES: Record<PropertyMediaType, ('url' | 'image' | 'pdf' | 'video')[]> = {
  video: ['url', 'video'],
  virtual_tour: ['url'],
  render: ['image', 'url'],
  pdf: ['pdf'],
  drone: ['image', 'video', 'url'],
  pano360: ['image'],
  other: ['image', 'pdf', 'url'],
}

/** Idiomas de un recurso (el mismo catálogo que el del contacto y el lead). */
export const MEDIA_LANGUAGES = ['es', 'en', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ar', 'zh', 'ca', 'eu', 'gl'] as const
export const MEDIA_LANGUAGE_LABELS: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  de: 'Alemán',
  it: 'Italiano',
  pt: 'Portugués',
  nl: 'Neerlandés',
  ru: 'Ruso',
  ar: 'Árabe',
  zh: 'Chino',
  ca: 'Catalán',
  eu: 'Euskera',
  gl: 'Gallego',
}

/** Límites de los textos de un recurso (título, alt, pie). */
export const MEDIA_TEXT_LIMITS = { title: 200, alt: 300, caption: 1000 } as const

/**
 * Un recurso sale en la web pública y en los portales sólo si es publicable,
 * no es privado y no está oculto (y, si tiene papelera, no está en ella).
 * Privado = sólo el equipo (su fichero deja de servirse sin sesión); oculto =
 * se conserva y se ve en el panel, pero no se publica en ningún sitio.
 */
export function isPublicMediaRow(row: { isPublishable?: number | boolean | null; isPrivate?: number | boolean | null; isHidden?: number | boolean | null; deletedAt?: string | null }): boolean {
  const publishable = row.isPublishable === undefined || row.isPublishable === null ? true : !!row.isPublishable
  return publishable && !row.isPrivate && !row.isHidden && !row.deletedAt
}

/**
 * Nivel de acceso de una visibilidad de documento: cada nivel incluye a los
 * anteriores. Interno (0) sólo el equipo; propietario (1) además los
 * propietarios y copropietarios de la propiedad; comprador autorizado (2)
 * además los contactos con acceso concedido; público (3) además cualquiera,
 * pero sólo si la propiedad está publicada y viva.
 */
export const DOCUMENT_ACCESS_LEVEL: Record<string, number> = { internal: 0, owner: 1, authorized_buyer: 2, public: 3 }

export function documentAccessLevel(visibility: string | null | undefined): number {
  return DOCUMENT_ACCESS_LEVEL[String(visibility)] ?? 0
}

/** Días antes de la caducidad en los que la ficha ya avisa. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30

export type DocumentExpiryState = 'expired' | 'expiring' | 'valid' | 'none'

export const DOCUMENT_EXPIRY_LABELS: Record<DocumentExpiryState, string> = {
  expired: 'Caducado',
  expiring: 'Caduca pronto',
  valid: 'Vigente',
  none: 'Sin caducidad',
}

/** Fecha de hoy en `AAAA-MM-DD` (UTC): las fechas de un documento son días, no instantes. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Estado de caducidad de un documento: caducado si su fecha ya pasó (el día
 * de caducidad todavía vale), «caduca pronto» si vence en los próximos
 * `DOCUMENT_EXPIRY_WARNING_DAYS` días, vigente si no, y sin caducidad si no
 * tiene fecha.
 */
export function documentExpiryState(expiresAt: string | null | undefined, today: string = todayIsoDate()): DocumentExpiryState {
  if (!expiresAt) return 'none'
  const day = String(expiresAt).slice(0, 10)
  if (day < today) return 'expired'
  if (day <= addDays(today, DOCUMENT_EXPIRY_WARNING_DAYS)) return 'expiring'
  return 'valid'
}

/** Tipos MIME que admite el gestor de documentos (PDF o imagen escaneada). */
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

/** Tamaño máximo de un documento (una escritura escaneada pesa bastante más que una foto). */
export const DOCUMENT_MAX_MB = 20

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

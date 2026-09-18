/**
 * Vocabulario y presentación del módulo de Clientes, en un solo sitio.
 *
 * Los valores son **exactamente** los que admite la columna correspondiente
 * de la tabla `clients` (`type`, `stage`) y los que declara
 * `adminResources.clients`. Si divergen, el desplegable ofrecería un valor
 * que el servidor rechaza — por eso hay una prueba que los compara.
 */

export interface ClientOption {
  value: string
  label: string
  /** Tono del badge. Cerrado a propósito: un color suelto en una plantilla es una decisión de diseño escondida. */
  tone: 'neutral' | 'positive' | 'muted' | 'strong'
}

export const CLIENT_TYPES: ClientOption[] = [
  { value: 'buyer', label: 'Comprador', tone: 'neutral' },
  { value: 'seller', label: 'Vendedor', tone: 'neutral' },
  { value: 'tenant', label: 'Inquilino', tone: 'neutral' },
  { value: 'investor', label: 'Inversor', tone: 'neutral' },
]

export const CLIENT_STAGES: ClientOption[] = [
  { value: 'active', label: 'Activo', tone: 'positive' },
  { value: 'closed', label: 'Cerrado', tone: 'strong' },
  { value: 'inactive', label: 'Inactivo', tone: 'muted' },
]

export const CLIENT_BADGE_CLASSES: Record<ClientOption['tone'], string> = {
  neutral: 'bg-stone-100 text-stone-600',
  positive: 'bg-emerald-100 text-emerald-700',
  muted: 'bg-stone-100 text-stone-500',
  strong: 'bg-stone-800 text-white',
}

export function clientOption(kind: 'type' | 'stage', value: string | null | undefined): ClientOption {
  const list = kind === 'type' ? CLIENT_TYPES : CLIENT_STAGES
  return list.find((o) => o.value === value) || { value: String(value ?? ''), label: String(value ?? '—'), tone: 'neutral' }
}

/**
 * Las marcas de tiempo se guardan como "YYYY-MM-DD HH:MM:SS" en UTC y sin
 * zona, así que `new Date()` las leería como hora local y las mostraría
 * desplazadas. Mismo arreglo que en el historial del Constructor Web.
 */
function parse(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(`${String(raw).replace(' ', 'T')}${String(raw).includes('Z') || String(raw).includes('+') ? '' : 'Z'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(raw: string | null | undefined): string {
  const d = parse(raw)
  return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

export function formatDateTime(raw: string | null | undefined): string {
  const d = parse(raw)
  return d ? d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

/** "hace 3 días" para la última actividad, que es lo que se mira de un vistazo. */
export function formatRelative(raw: string | null | undefined): string {
  const d = parse(raw)
  if (!d) return '—'
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 365) return `hace ${Math.round(days / 30)} meses`
  return `hace ${Math.round(days / 365)} años`
}

/** Iniciales para el avatar: el modelo no guarda fotografía de cliente. */
export function initials(name: string | null | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

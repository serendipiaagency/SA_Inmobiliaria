/**
 * Textos legibles de los estados de una empresa — compartidos por el panel
 * (Sistemas > Empresas: listado, asistente de alta y ficha) y por el servidor
 * (server/utils/organizations/access.ts, emails de cambio de estado), para
 * que la pantalla y el email digan exactamente lo mismo.
 */

export const ORGANIZATION_STATUS_LABELS: Record<string, { label: string; description: string }> = {
  active: { label: 'Activa', description: 'La empresa y su equipo pueden usar INMO.' },
  suspended: { label: 'Suspendida', description: 'El acceso queda bloqueado; los datos y las cuentas se conservan.' },
}

export const REGISTRATION_SOURCE_LABELS: Record<string, string> = {
  admin: 'Panel (Sistemas > Empresas)',
  self_service: 'Registro web',
  // Aprovisionada por la plataforma (server/utils/demo/): no envía nada fuera.
  demo: 'Cuenta demo (sin envíos reales)',
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  pending: 'Pendiente de aprobación',
  rejected: 'Rechazada',
}

export const BILLING_STATUS_LABELS: Record<string, string> = {
  not_required: 'No requerido',
  pending: 'Pago pendiente',
  active: 'Al día',
  past_due: 'Pago vencido',
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin (plataforma)',
  admin: 'Administrador',
  user: 'Usuario',
}

/** Texto de una celda del listado de Empresas; null = mostrar el valor tal cual. */
export function organizationCellLabel(field: string, value: unknown): string | null {
  if (field === 'status') return ORGANIZATION_STATUS_LABELS[String(value)]?.label ?? null
  if (field === 'registrationSource') return REGISTRATION_SOURCE_LABELS[String(value)] ?? null
  if (field === 'emailSenderDomainVerified') return value === 1 || value === true ? 'Verificado' : 'Sin verificar'
  return null
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}

/** Texto blanco o negro sobre un color de marca, el que tenga más contraste (WCAG). */
export function readableTextOn(hex: string): '#FFFFFF' | '#111827' {
  if (!isHexColor(hex)) return '#FFFFFF'
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  const contrastWhite = 1.05 / (lum + 0.05)
  const contrastDark = (lum + 0.05) / (0.0137 + 0.05) // #111827
  return contrastWhite >= contrastDark ? '#FFFFFF' : '#111827'
}

/** Estado de la comprobación inmediata de un dominio (OrgDomainField). */
export type DomainState = 'empty' | 'checking' | 'ok' | 'taken' | 'invalid' | 'error'

/** Dominio tal y como lo guardará el servidor: sin esquema, sin ruta, sin puerto, en minúsculas. */
export function previewDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .toLowerCase()
    .replace(/^www\./, '') // igual que normalizeHost() (server/utils/domain.ts)
}

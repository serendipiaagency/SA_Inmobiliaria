/**
 * Qué decir en admin_audit_log cuando cambia algo sensible.
 *
 * ## Por qué
 *
 * El chokepoint genérico del panel registra "quién tocó qué fila", pero no
 * *qué* cambió. Para la mayoría de recursos da igual; para tres cosas no:
 *
 *  - una contraseña que cambia (la de otra persona, desde el panel, o la
 *    propia por un enlace de recuperación),
 *  - un rol que sube a super_admin,
 *  - unos permisos por área que se amplían o se recortan.
 *
 * Son exactamente las acciones que uno quiere poder rastrear cuando algo ha
 * ido mal, y hasta ahora quedaban como un `update users 7` indistinguible de
 * cambiarle el nombre.
 *
 * ## Lo que nunca sale de aquí
 *
 * Ningún valor secreto. De la contraseña sólo se dice *que* cambió; del
 * rol y los permisos se dice el antes y el después porque no son secretos —
 * son precisamente lo que se quiere poder auditar.
 *
 * Funciones puras (sin evento, sin base de datos) para poder probarlas con
 * los casos límite que importan: que un guardado sin tocar la contraseña no
 * la anote como cambiada, que un `permissions` que vuelve igual del
 * formulario no cuente como cambio.
 */

export interface UserAuditSnapshot {
  role?: string | null
  permissions?: string | null
}

function describePermissions(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return 'sin restricción'
  return String(raw)
}

/**
 * Detalle para un `users` que se crea. `data` es el payload ya preparado
 * (`buildPayload` + `prepare`): si trae `password`, es porque se ha fijado
 * una — pero su valor ya es el hash y aquí ni siquiera se mira.
 */
export function describeUserCreation(data: Record<string, any>): string {
  const parts: string[] = []
  parts.push(`rol: ${data.role || 'user'}`)
  if (data.role === 'super_admin') parts.push('CONCEDIDO super_admin')
  if (data.permissions != null && String(data.permissions).trim() !== '') parts.push(`permisos: ${describePermissions(data.permissions)}`)
  return parts.join('; ')
}

/**
 * Detalle para un `users` que se actualiza, o `undefined` si no cambia nada
 * que merezca constar (en ese caso el registro genérico ya basta).
 */
export function describeUserChanges(existing: UserAuditSnapshot, data: Record<string, any>): string | undefined {
  const parts: string[] = []
  // `prepare` borra `password` del payload cuando llega vacío, así que su
  // mera presencia significa que se ha fijado una nueva.
  if (data.password) parts.push('contraseña cambiada')
  if (typeof data.role === 'string' && data.role !== (existing.role ?? 'user')) {
    parts.push(`rol: ${existing.role ?? 'user'} → ${data.role}`)
    if (data.role === 'super_admin') parts.push('CONCEDIDO super_admin')
  }
  if ('permissions' in data && describePermissions(data.permissions) !== describePermissions(existing.permissions)) {
    parts.push(`permisos: ${describePermissions(existing.permissions)} → ${describePermissions(data.permissions)}`)
  }
  return parts.length ? parts.join('; ') : undefined
}

export interface OrganizationAuditSnapshot {
  domain?: string | null
  status?: string | null
}

/**
 * Lo mismo para `organizations`: el dominio decide a qué agencia se sirve en
 * cada host y el estado decide si la agencia entera responde. Un cambio ahí
 * es lo primero que se busca cuando "la web de un cliente no carga".
 */
export function describeOrganizationChanges(existing: OrganizationAuditSnapshot, data: Record<string, any>): string | undefined {
  const parts: string[] = []
  if ('domain' in data && (data.domain || null) !== (existing.domain || null)) {
    parts.push(`dominio: ${existing.domain || '(ninguno)'} → ${data.domain || '(ninguno)'}`)
  }
  if (typeof data.status === 'string' && data.status !== existing.status) {
    parts.push(`estado: ${existing.status} → ${data.status}`)
  }
  return parts.length ? parts.join('; ') : undefined
}

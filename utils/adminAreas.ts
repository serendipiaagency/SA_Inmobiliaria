/**
 * The admin panel's permission areas (P2 granular RBAC,
 * docs/production-hardening-audit.md) — one per nav group in
 * layouts/admin.vue (minus "Ayuda", which stays visible to every admin).
 * Root-level `utils/` so this one list is the single source of truth for
 * both the client (nav filtering, the permissions editor UI) and the server
 * (server/utils/permissions.ts, explicitly imported since server/utils/ is
 * Nitro's own separate auto-import scope).
 */
export type AdminArea = 'general' | 'crm' | 'web' | 'finance' | 'cms' | 'content' | 'inbox' | 'system'

export const ADMIN_AREAS: { key: AdminArea; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'crm', label: 'CRM' },
  { key: 'web', label: 'Portal Web' },
  { key: 'finance', label: 'Finanzas & Growth' },
  { key: 'cms', label: 'Blog & CMS' },
  { key: 'content', label: 'Contenido' },
  { key: 'inbox', label: 'Bandeja' },
  { key: 'system', label: 'Sistema' },
]

export function isAdminArea(value: string): value is AdminArea {
  return ADMIN_AREAS.some((a) => a.key === value)
}

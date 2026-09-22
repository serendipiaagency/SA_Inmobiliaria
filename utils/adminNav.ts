import type { AdminArea } from './adminAreas'

/**
 * The admin panel's navigation, and the one place that says which permission
 * area each admin page belongs to.
 *
 * It lives in root `utils/` rather than inside layouts/admin.vue because two
 * different consumers need the same answer and must not drift apart
 * (bloque 01, "alinea menú, botones y API"):
 *
 *  - layouts/admin.vue renders it, hiding the groups the account can't read.
 *  - middleware/admin.ts refuses to *navigate* to a page whose area the
 *    account can't read, so a restricted admin who types the URL by hand
 *    lands somewhere they're allowed instead of on a shell full of 403s.
 *
 * The server-side counterpart is server/utils/adminRouteMatrix.ts, which maps
 * the API endpoints those pages call. Both read their area names from
 * utils/adminAreas.ts.
 */

export interface NavItem {
  label: string
  to: string
  icon: string
  /** Not set by any item today — the template already supports it for a future per-item counter/notice. */
  badge?: string
  /** Not set by any item today — the template already supports it for a future "beta"/"nuevo" style label. */
  tag?: string
  /** Platform-owner pages: hidden from, and never navigable by, an org admin. */
  superAdminOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
  /** Permissions area (utils/adminAreas.ts) this group is gated behind for a restricted admin. Omit only for "Ayuda", which stays visible to everyone. */
  area?: AdminArea
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'General',
    area: 'general',
    items: [
      { label: 'Dashboard', to: '/admin', icon: 'grid' },
      { label: 'Analytics', to: '/admin/analytics', icon: 'chart' },
    ],
  },
  {
    label: 'CRM',
    area: 'crm',
    items: [
      { label: 'Contactos', to: '/admin/contactos', icon: 'users' },
      { label: 'Compatibilidades', to: '/admin/compatibilidades', icon: 'sparkles' },
      { label: 'Leads', to: '/admin/leads', icon: 'contact' },
      { label: 'Clientes', to: '/admin/clientes', icon: 'users' },
      { label: 'Comunicaciones', to: '/admin/comunicaciones', icon: 'chat' },
      { label: 'Visitas', to: '/admin/visitas', icon: 'calendar' },
      { label: 'Analítica de citas', to: '/admin/citas-analytics', icon: 'chart' },
      { label: 'Reservas', to: '/admin/reservas', icon: 'bookmark' },
      { label: 'Referidos', to: '/admin/referidos', icon: 'sparkles' },
    ],
  },
  {
    label: 'Portal Web',
    area: 'web',
    items: [
      { label: 'Propiedades (web)', to: '/admin/developer-properties', icon: 'building' },
      { label: 'Constructor Web', to: '/admin/site-builder', icon: 'widget' },
      { label: 'Propiedades 2ª mano', to: '/admin/properties', icon: 'layers' },
      { label: 'Comerciales', to: '/admin/comerciales', icon: 'badge' },
      { label: 'Comunidades', to: '/admin/communities', icon: 'store' },
      { label: 'Publicación multicanal', to: '/admin/scheduler', icon: 'bolt' },
      { label: 'Brand Kit', to: '/admin/asset-export/brand-kit', icon: 'sparkles' },
      { label: 'Plantillas de Export', to: '/admin/asset-export/templates', icon: 'layers' },
      { label: 'Piezas generadas', to: '/admin/asset-export/projects', icon: 'doc' },
      { label: 'Exportación masiva', to: '/admin/asset-export/batches', icon: 'bolt' },
      { label: 'Catálogos combinados', to: '/admin/asset-export/catalogs', icon: 'doc' },
    ],
  },
  {
    label: 'Finanzas & Growth',
    area: 'finance',
    items: [
      { label: 'Facturación', to: '/admin/facturacion', icon: 'invoice' },
      { label: 'Operaciones', to: '/admin/operaciones', icon: 'invoice' },
      { label: 'Ingresos', to: '/admin/ingresos', icon: 'chart' },
      { label: 'Contratos', to: '/admin/contratos', icon: 'doc' },
      { label: 'Depósitos', to: '/admin/depositos', icon: 'key' },
      { label: 'Tasador (AVM)', to: '/admin/tasador', icon: 'badge' },
      { label: 'Automatizaciones', to: '/admin/automatizaciones', icon: 'bolt' },
      { label: 'AI Studio', to: '/admin/ai', icon: 'sparkles' },
      { label: 'Widgets', to: '/admin/widgets', icon: 'widget' },
      { label: 'Marketplace', to: '/admin/marketplace', icon: 'store' },
      { label: 'API', to: '/admin/api', icon: 'code' },
    ],
  },
  {
    label: 'Blog & CMS',
    area: 'cms',
    items: [
      { label: 'Dashboard', to: '/admin/cms', icon: 'sparkles' },
      { label: 'Artículos', to: '/admin/cms/articles', icon: 'doc' },
      { label: 'Categorías', to: '/admin/cms-categories', icon: 'layers' },
      { label: 'Etiquetas', to: '/admin/cms-tags', icon: 'badge' },
      { label: 'Autores', to: '/admin/cms-authors', icon: 'team' },
      { label: 'Media Library', to: '/admin/cms/media', icon: 'widget' },
      { label: 'Comentarios', to: '/admin/cms-comments', icon: 'contact' },
      { label: 'Redirecciones', to: '/admin/cms-redirects', icon: 'code' },
      { label: 'Papelera', to: '/admin/cms/papelera', icon: 'inbox' },
      { label: 'Config. Blog', to: '/admin/cms/configuracion', icon: 'settings' },
    ],
  },
  {
    label: 'Contenido',
    area: 'content',
    items: [
      { label: 'Blog (legacy)', to: '/admin/blogs', icon: 'doc' },
      // "Equipo" vivía aquí y editaba el horario de las mismas personas que
      // "Comerciales" (ambas sobre team_members), con lo que la misma ficha
      // aparecía en dos sitios del menú y con dos nombres. El horario es
      // ahora una subruta de la ficha del comercial
      // (/admin/comerciales/:id/horario), así que hay un solo módulo.
    ],
  },
  {
    label: 'Bandeja',
    area: 'inbox',
    items: [
      { label: 'Solicitudes', to: '/admin/visitor-submissions', icon: 'inbox' },
      { label: 'Proveedores', to: '/admin/vendor-registrations', icon: 'inbox' },
      { label: 'Mensajes', to: '/admin/contact-messages', icon: 'contact' },
    ],
  },
  {
    label: 'Ayuda',
    items: [{ label: 'Ayuda y documentación', to: '/admin/ayuda', icon: 'help' }],
  },
  {
    label: 'Sistema',
    area: 'system',
    items: [
      { label: 'Configuración', to: '/admin/configuracion', icon: 'settings' },
      { label: 'Usuarios', to: '/admin/users', icon: 'key' },
      { label: 'Webhooks', to: '/admin/webhooks', icon: 'code' },
      { label: 'Emails', to: '/admin/emails', icon: 'mail' },
      { label: 'Privacidad (RGPD)', to: '/admin/privacidad', icon: 'alert' },
      // Org-scoped: shows this org's own team activity (server/utils/audit.ts).
      { label: 'Auditoría', to: '/admin/audit-log', icon: 'doc' },
      { label: 'Empresas', to: '/admin/organizations', icon: 'store', superAdminOnly: true },
      // Platform-wide incident log (server/plugins/error-logging.ts) — ops
      // concern for the whole platform, not a tenant's business data, so it's
      // super_admin-only like "Empresas" above.
      { label: 'Errores', to: '/admin/error-logs', icon: 'alert', superAdminOnly: true },
      // Configuración de la plataforma entera (qué integraciones están vivas,
      // dormidas o mal configuradas) — misma razón que las dos de arriba.
      { label: 'Estado del sistema', to: '/admin/estado', icon: 'settings', superAdminOnly: true },
    ],
  },
]

/**
 * The area that owns an admin page URL, or `null` when no nav entry claims it
 * — the generic `[resource]` pages for resources that have no menu entry
 * (floor-plans, amenities, …) are reachable only by deep link, and the server
 * matrix is what actually guards them. `null` therefore means "don't block
 * this navigation", never "this page is public".
 *
 * Matching is segment-aware and longest-first, so `/admin/api` never swallows
 * `/admin/apikeys` and `/admin/cms/articles` wins over `/admin/cms`.
 */
export function areaForAdminPath(path: string): AdminArea | null {
  const clean = (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
  let best: { length: number; area: AdminArea | null } | null = null
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (clean !== item.to && !clean.startsWith(`${item.to}/`)) continue
      if (!best || item.to.length > best.length) best = { length: item.to.length, area: group.area ?? null }
    }
  }
  return best ? best.area : null
}

/** True when the page is one of the platform-owner-only entries. */
export function isSuperAdminOnlyAdminPath(path: string): boolean {
  const clean = (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
  return ADMIN_NAV.some((g) => g.items.some((i) => i.superAdminOnly && (clean === i.to || clean.startsWith(`${i.to}/`))))
}
